import {
  LegacyViewer,
  DefaultViewerParams,
  FilteringState,
  IntersectionQuery,
  CameraController,
  CanonicalView,
  ViewModes,
  CameraEvent,
  SpeckleView
} from '@speckle/viewer'
import { SpeckleObjectsOfflineLoader } from '@src/laoder/SpeckleObjectsOfflineLoader'
import { useVisualStore } from '@src/store/visualStore'
import { Tracker } from '@src/utils/mixpanel'
import { createNanoEvents, Emitter } from 'nanoevents'
import { ColorPicker } from 'powerbi-visuals-utils-formattingmodel/lib/FormattingSettingsComponents'
import { Vector3 } from 'three'

export interface IViewer {
  /**
   * Events sent over from the host application.
   */
  on: <E extends keyof IViewerEvents>(event: E, callback: IViewerEvents[E]) => void
}

export declare enum ViewMode {
  DEFAULT = 0,
  DEFAULT_EDGES = 1,
  SHADED = 2,
  PEN = 3,
  ARCTIC = 4,
  COLORS = 5
}

export interface Hit {
  guid: string
  object?: Record<string, unknown>
  point: { x: number; y: number; z: number }
}

export interface IViewerEvents {
  ping: (message: string) => void
  setSelection: (objectIds: string[]) => void
  setViewMode: (viewMode: ViewMode) => void
  colorObjectsByGroup: (
    colorById: {
      objectIds: string[]
      slice: ColorPicker
      color: string
    }[]
  ) => void
  isolateObjects: (objectIds: string[]) => void
  forceViewerUpdate: () => void
  unIsolateObjects: () => void
  zoomExtends: () => void
  loadObjects: (objects: object[]) => void
}

export class ViewerHandler {
  public emitter: Emitter
  public viewer: LegacyViewer
  private _needsRender = false
  private parent: HTMLElement
  private filteringState: FilteringState

  constructor() {
    this.emitter = createNanoEvents()
    this.emit = this.emit.bind(this)
    this.emitter.on('ping', this.handlePing)
    this.emitter.on('setSelection', this.selectObjects)
    this.emitter.on('setViewMode', this.setViewMode)
    this.emitter.on('colorObjectsByGroup', this.colorObjectsByGroup)
    this.emitter.on('isolateObjects', this.isolateObjects)
    this.emitter.on('unIsolateObjects', this.unIsolateObjects)
    this.emitter.on('zoomExtends', this.zoomExtends)
    this.emitter.on('zoomObjects', this.zoomObjects)
    this.emitter.on('loadObjects', this.loadObjects)
  }

  async init(parent: HTMLElement) {
    this.viewer = await createViewer(parent)
    this.parent = parent
    this.viewer.speckleRenderer.speckleCamera.on(
      CameraEvent.FrameUpdate,
      (needsUpdate: boolean) => {
        this.needsRender = needsUpdate
      }
    )
  }

  get needsRender(): boolean {
    return this._needsRender
  }

  set needsRender(value: boolean) {
    if (this._needsRender !== value) {
      this._needsRender = value
      this.onNeedsRenderChanged(value)
    }
  }

  private onNeedsRenderChanged(value: boolean) {
    // whenever the render is settled means that user stopped interaction, so we will set the camera position
    if (!value) {
      console.log('🎬 Storing the camera position into file')
      const cameraController = this.viewer.getExtension(CameraController)
      const position = cameraController.getPosition()
      const target = cameraController.getTarget()
      const store = useVisualStore()
      store.writeCameraPositionToFile(position, target)
    }
  }

  emit<E extends keyof IViewerEvents>(event: E, ...payload: Parameters<IViewerEvents[E]>): void {
    this.emitter.emit(event, ...payload)
  }

  public zoomObjects = (objectIds: string[]) => {
    this.viewer.zoom(objectIds)
  }

  public zoomExtends = () => this.viewer.zoom()

  public setView = (view: CanonicalView) => this.viewer.setView(view)

  public setSectionBox = (bboxActive: boolean, objectIds: string[]) => {
    // TODO
    return
  }

  public setViewMode(viewMode: ViewMode) {
    const viewModes = this.viewer.getExtension(ViewModes)
    viewModes.setViewMode(viewMode)
  }

  public selectObjects = async (objectIds: string[]) => {
    console.log('🔗 Handling setSelection inside ViewerHandler:', objectIds)
    if (objectIds) {
      await this.viewer.selectObjects(objectIds)
    }
  }

  public colorObjectsByGroup = async (
    colorByIds: {
      objectIds: string[]
      color: string
    }[]
  ) => {
    this.filteringState = await this.viewer.setUserObjectColors(colorByIds ?? [])
  }

  public isolateObjects = async (objectIds: string[], ghost: boolean) => {
    await this.unIsolateObjects()
    this.filteringState = await this.viewer.isolateObjects(objectIds, 'powerbi', true, ghost)
  }

  public unIsolateObjects = async () => {
    if (this.filteringState && this.filteringState.isolatedObjects) {
      this.filteringState = await this.viewer.unIsolateObjects(
        this.filteringState.isolatedObjects,
        'powerbi',
        true
      )
    }
  }

  public intersect = (coords: { x: number; y: number }) => {
    const point = this.viewer.Utils.screenToNDC(
      coords.x,
      coords.y,
      this.parent.clientWidth,
      this.parent.clientHeight
    )
    const intQuery: IntersectionQuery = {
      operation: 'Pick',
      point
    }

    const res = this.viewer.query(intQuery)
    // console.log(res, 'pick objects')

    if (!res) {
      this.viewer.selectObjects([])
      return
    }
    return {
      hit: this.pickViewableHit(res.objects),
      objects: res.objects
    }
  }

  public loadObjects = async (objects: object[]) => {
    await this.viewer.unloadAll()
    // const stringifiedObject = JSON.stringify(objects)
    //@ts-ignore
    const loader = new SpeckleObjectsOfflineLoader(this.viewer.getWorldTree(), objects)
    const store = useVisualStore()

    const speckleViews = objects.filter(
      //@ts-ignore
      (o) => o.speckle_type === 'Objects.BuiltElements.View:Objects.BuiltElements.View3D'
    ) as SpeckleView[]

    store.setSpeckleViews(speckleViews)
    if (store.defaultViewModeInFile) {
      this.setViewMode(Number(store.defaultViewModeInFile))
    }
    await this.viewer.loadObject(loader, true)
    Tracker.dataLoaded({ sourceHostApp: store.receiveInfo.sourceApplication })
    // camera need to be set after objects loaded
    if (store.cameraPosition) {
      const position = new Vector3(
        store.cameraPosition[0],
        store.cameraPosition[1],
        store.cameraPosition[2]
      )
      const target = new Vector3(
        store.cameraPosition[3],
        store.cameraPosition[4],
        store.cameraPosition[5]
      )
      const cameraController = this.viewer.getExtension(CameraController)
      cameraController.setCameraView({ position, target }, true)
    }
  }

  private handlePing = (message: string) => {
    console.log(message)
  }

  private pickViewableHit(hits: Hit[]): Hit | null {
    // let hit = null
    // if (this.filteringState.isolatedObjects) {
    //   // Find the first hit contained in the isolated objects
    //   hit = hits.find((hit) => {
    //     const hitId = hit.object.id as string
    //     return this.filteringState.isolatedObjects.includes(hitId)
    //   })
    // }
    const hit = hits.find((h) => this.filteringState.isolatedObjects.includes(h.guid))
    return hit
  }

  public dispose() {
    this.viewer.getExtension(CameraController).dispose()
    this.viewer.dispose()
    this.viewer = null
  }
}

const createViewer = async (parent: HTMLElement): Promise<LegacyViewer> => {
  const viewerSettings = DefaultViewerParams
  viewerSettings.showStats = false
  viewerSettings.verbose = false
  const viewer = new LegacyViewer(parent, viewerSettings)
  await viewer.init()
  console.log('🎥 Viewer is created!')
  return viewer
}
