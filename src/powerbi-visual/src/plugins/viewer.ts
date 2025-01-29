import {
  LegacyViewer,
  DefaultViewerParams,
  SpeckleOfflineLoader,
  FilteringState,
  IntersectionQuery,
  CameraController,
  CanonicalView
} from '@speckle/viewer'
import { SpeckleDataInput } from '@src/types'
import { Tracker } from '@src/utils/mixpanel'
import { createNanoEvents, Emitter } from 'nanoevents'
import { ColorPicker } from 'powerbi-visuals-utils-formattingmodel/lib/FormattingSettingsComponents'
import { toRaw } from 'vue'

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
  private parent: HTMLElement
  private filteringState: FilteringState

  constructor() {
    this.emitter = createNanoEvents()
    this.emit = this.emit.bind(this)
    this.emitter.on('ping', this.handlePing)
    this.emitter.on('setSelection', this.selectObjects)
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
    const stringifiedObject = JSON.stringify(objects)
    const loader = new SpeckleOfflineLoader(this.viewer.getWorldTree(), stringifiedObject)
    await this.viewer.loadObject(loader, true)
    Tracker.dataLoaded()
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
