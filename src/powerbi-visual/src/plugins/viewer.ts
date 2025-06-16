import {
  DefaultViewerParams,
  FilteringState,
  IntersectionQuery,
  CameraController,
  CanonicalView,
  ViewModes,
  CameraEvent,
  SpeckleView,
  ViewMode,
  Viewer,
  HybridCameraController,
  SelectionExtension,
  FilteringExtension,
  UpdateFlags,
  ViewerEvent
} from '@speckle/viewer'
import { SpeckleObjectsOfflineLoader } from '@src/laoder/SpeckleObjectsOfflineLoader'
import { useVisualStore } from '@src/store/visualStore'
import { Tracker } from '@src/utils/mixpanel'
import { createNanoEvents, Emitter } from 'nanoevents'
import { Vector3 } from 'three'

export interface IViewer {
  /**
   * Events sent over from the host application.
   */
  on: <E extends keyof IViewerEvents>(event: E, callback: IViewerEvents[E]) => void
}

export interface Hit {
  guid: string
  object?: Record<string, unknown>
  point: { x: number; y: number; z: number }
}

export interface IViewerEvents {
  ping: (message: string) => void
  setSelection: (objectIds: string[]) => void
  resetFilter: (objectIds: string[], ghost: boolean) => void
  filterSelection: (objectIds: string[], ghost: boolean) => void
  setViewMode: (viewMode: ViewMode) => void
  colorObjectsByGroup: (
    colorById: {
      objectIds: string[]
      color: string
    }[]
  ) => void
  isolateObjects: (objectIds: string[]) => void
  unIsolateObjects: () => void
  zoomExtends: () => void
  toggleProjection: () => void
  toggleGhostHidden: (ghost: boolean) => void
  loadObjects: (objects: object[]) => void
}

export type ColorBy = {
  objectIds: string[]
  color: string
}

export class ViewerHandler {
  public emitter: Emitter
  public viewer: Viewer
  public cameraControls: CameraController
  public filtering: FilteringExtension
  public selection: SelectionExtension
  private filteringState: FilteringState

  constructor() {
    this.emitter = createNanoEvents()
    this.emit = this.emit.bind(this)
    this.emitter.on('ping', this.handlePing)
    this.emitter.on('filterSelection', this.filterSelection)
    this.emitter.on('resetFilter', this.resetFilter)
    this.emitter.on('setSelection', this.selectObjects)
    this.emitter.on('setViewMode', this.setViewMode)
    this.emitter.on('colorObjectsByGroup', this.colorObjectsByGroup)
    this.emitter.on('isolateObjects', this.isolateObjects)
    this.emitter.on('unIsolateObjects', this.unIsolateObjects)
    this.emitter.on('zoomExtends', this.zoomExtends)
    this.emitter.on('zoomObjects', this.zoomObjects)
    this.emitter.on('loadObjects', this.loadObjects)
    this.emitter.on('toggleProjection', this.toggleProjection)
    this.emitter.on('toggleGhostHidden', this.toggleGhostHidden)
  }

  async init(parent: HTMLElement) {
    this.viewer = await createViewer(parent)
    this.cameraControls = this.viewer.getExtension(CameraController)
    this.filtering = this.viewer.getExtension(FilteringExtension)
    this.selection = this.viewer.getExtension(SelectionExtension)

    const store = useVisualStore()
    if (store.isOrthoProjection) {
      this.cameraControls.toggleCameras()
    }

    this.viewer.on(ViewerEvent.LoadComplete, (arg: string) => {
      store.clearLoadingProgress()
    })
  }

  emit<E extends keyof IViewerEvents>(event: E, ...payload: Parameters<IViewerEvents[E]>): void {
    this.emitter.emit(event, ...payload)
  }

  public zoomObjects = (objectIds: string[], animate = false) => {
    /** Second argument here is for animating the camera movement. Default is false */
    this.cameraControls.setCameraView(objectIds, animate)
  }

  public zoomExtends = () => {
    this.cameraControls.setCameraView(undefined, true)
    this.viewer.requestRender(UpdateFlags.RENDER_RESET)
  }
  public toggleProjection = () => this.cameraControls.toggleCameras()

  public setView = (view: CanonicalView) => {
    this.cameraControls.setCameraView(view, false)
    this.snapshotCameraPositionAndStore()
  }

  public setSectionBox = (bboxActive: boolean, objectIds: string[]) => {
    // TODO
    return
  }

  public setViewMode(viewMode: ViewMode) {
    const viewModes = this.viewer.getExtension(ViewModes)
    viewModes.setViewMode(viewMode)
  }

  public snapshotCameraPositionAndStore = () => {
    console.log('🎬 Storing the camera position into file')
    const cameraController = this.viewer.getExtension(CameraController)
    const position = cameraController.getPosition()
    const target = cameraController.getTarget()
    const store = useVisualStore()
    store.writeCameraPositionToFile(position, target)
  }

  public selectObjects = (objectIds: string[]) => {
    console.log('🔗 Handling setSelection inside ViewerHandler:', objectIds)
    if (objectIds) {
      this.selection.selectObjects(objectIds)
    }
  }

  public filterSelection = (objectIds: string[], ghost: boolean) => {
    console.log('🔗 Handling filterSelection inside ViewerHandler')
    if (objectIds) {
      this.unIsolateObjects()
      this.filteringState = this.filtering.isolateObjects(objectIds, 'powerbi', true, ghost)
      this.zoomObjects(objectIds, true)
    }
  }

  public resetFilter = (objectIds: string[], ghost: boolean) => {
    console.log('🔗 Handling filterSelection inside ViewerHandler')
    if (objectIds) {
      this.isolateObjects(objectIds, ghost)
      this.zoomObjects(objectIds, true)
    }
  }

  public colorObjectsByGroup = (colorByIds: ColorBy[]) => {
    this.filteringState = this.filtering.setUserObjectColors(colorByIds ?? [])
  }

  public isolateObjects = (objectIds: string[], ghost: boolean) => {
    this.unIsolateObjects()
    this.filteringState = this.filtering.isolateObjects(objectIds, 'powerbi', true, ghost)
  }

  public toggleGhostHidden = (ghost: boolean) => {
    this.filteringState = this.filtering.isolateObjects(
      this.filteringState.isolatedObjects,
      'powerbi',
      true,
      ghost
    )
  }

  public unIsolateObjects = () => {
    if (this.filteringState && this.filteringState.isolatedObjects) {
      this.filteringState = this.filtering.unIsolateObjects(
        this.filteringState.isolatedObjects,
        'powerbi',
        true
      )
    }
  }

  public intersect = (coords: { x: number; y: number }) => {
    const point = this.viewer.Utils.screenToNDC(coords.x, coords.y)

    const intQuery: IntersectionQuery = {
      operation: 'Pick',
      point
    }

    const res = this.viewer.query(intQuery)

    if (!res) {
      this.selection.clearSelection()
      return
    }
    return {
      hit: this.pickViewableHit(res.objects),
      objects: res.objects
    }
  }

  public loadObjects = async (modelObjects: object[][]) => {
    await this.viewer.unloadAll()
    // const stringifiedObject = JSON.stringify(objects)

    const store = useVisualStore()
    const speckleViews = []

    modelObjects.forEach(async (objects) => {
      //@ts-ignore
      const loader = new SpeckleObjectsOfflineLoader(this.viewer.getWorldTree(), objects)

      const speckleViewsInModel = objects.filter(
        //@ts-ignore
        (o) => o.speckle_type === 'Objects.BuiltElements.View:Objects.BuiltElements.View3D'
      ) as SpeckleView[]
      speckleViews.concat(speckleViewsInModel)

      // Since you are setting another camera position, maybe you want the second argument to false
      await this.viewer.loadObject(loader, true)
      this.viewer.getRenderer().shadowcatcher.shadowcatcherMesh.visible = false // works fine only right after loadObjects
    })

    store.setSpeckleViews(speckleViews)
    if (store.defaultViewModeInFile) {
      this.setViewMode(Number(store.defaultViewModeInFile))
    }

    Tracker.dataLoaded({
      sourceHostApp: store.receiveInfo.sourceApplication,
      workspace_id: store.receiveInfo.workspaceId,
      core_version: store.receiveInfo.version
    })
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
      this.cameraControls.setCameraView({ position, target }, true)
    }
  }

  private handlePing = (message: string) => {
    console.log(message)
  }

  private pickViewableHit(hits: Hit[]): Hit | null {
    // The current filtering state
    const filteringState = this.filtering.filteringState
    // Are there any objects isolated?
    const hasIsolatedObjects =
      !!filteringState.isolatedObjects && filteringState.isolatedObjects.length !== 0
    // Are there any objects hidden?
    const hasHiddenObjects =
      !!filteringState.hiddenObjects && filteringState.hiddenObjects.length !== 0
    // No isolated or hidden objects? Return the first hit
    if (hasIsolatedObjects && !hasHiddenObjects) {
      return hits.find((h) => filteringState.isolatedObjects.includes(h.guid))
    }

    for (let k = 0; k < hits.length; k++) {
      /** Return the first one that's not hidden or isolated. */
      if (
        hasIsolatedObjects &&
        filteringState.isolatedObjects?.includes(hits[k].guid) &&
        hasHiddenObjects &&
        filteringState.hiddenObjects?.includes(hits[k].guid)
      )
        return hits[k]
    }
  }

  public dispose() {
    this.viewer.getExtension(CameraController).dispose()
    this.viewer.dispose()
    this.viewer = null
  }
}

const createViewer = async (parent: HTMLElement): Promise<Viewer> => {
  const viewerSettings = DefaultViewerParams
  viewerSettings.showStats = false
  viewerSettings.verbose = true // Turning this on so we can see logs for now
  const viewer = new Viewer(parent, viewerSettings)
  await viewer.init()

  viewer.createExtension(HybridCameraController) // camera controller
  viewer.createExtension(SelectionExtension) // selection helper
  // viewer.createExtension(SectionTool) // section tool, possibly not needed for now?
  // viewer.createExtension(SectionOutlines) // section tool, possibly not needed for now?
  // viewer.createExtension(MeasurementsExtension) // measurements, possibly not needed for now?
  viewer.createExtension(FilteringExtension) // filtering
  viewer.createExtension(ViewModes) // view modes

  console.log('🎥 Viewer is created!')
  return viewer
}
