import {
  CanonicalView,
  FilteringState,
  LegacyViewer,
  IntersectionQuery,
  DefaultViewerParams,
  SpeckleView,
  CameraController,
  CameraEvent,
  SpeckleOfflineLoader
} from '@speckle/viewer'
import { pickViewableHit, projectToScreen } from '../utils/viewerUtils'
import _ from 'lodash'
import { SpeckleVisualSettingsModel } from 'src/settings/visualSettingsModel'
import { PerspectiveCamera, OrthographicCamera, Box3 } from 'three'
import { obj } from './obj'
// import { obj2 } from './obj2'
export default class ViewerHandler {
  private viewer: LegacyViewer
  private readonly parent: HTMLElement
  private state: FilteringState
  private loadedObjectsCache: Set<string> = new Set<string>()
  private config = {
    authToken: null,
    batchSize: 25
  }
  private currentSectionBox: Box3 = null
  private currentSettings: SpeckleVisualSettingsModel

  public getViews() {
    return this.viewer.getViews()
  }

  public updateSettings(settings: SpeckleVisualSettingsModel) {
    // Camera settings
    switch (settings.camera.projection.value) {
      case 'perspective':
        this.viewer.setPerspectiveCameraOn()
        break
      case 'orthographic':
        this.viewer.setOrthoCameraOn()
        break
    }

    var camController = this.viewer.getExtension(CameraController)
    var angle = settings.camera.allowCameraUnder.value ? Math.PI : Math.PI / 2
    camController.options = { maximumPolarAngle: angle }

    // Lighting settings
    const newConfig = settings.lighting.getViewerConfiguration()
    this.viewer.setLightConfiguration(newConfig)

    this.currentSettings = settings
  }

  public setView(view: SpeckleView | CanonicalView) {
    this.viewer.setView(view)
  }

  public setSectionBox(active: boolean, objectIds: string[]) {
    if (active) {
      if (this.currentSectionBox === null) {
        const bbox = this.viewer.getSectionBoxFromObjects(objectIds)
        this.viewer.setSectionBox(bbox)
        this.currentSectionBox = bbox as unknown as Box3
      } else {
        const bbox = this.viewer.getCurrentSectionBox()
        if (bbox) this.currentSectionBox = bbox as unknown as Box3
      }
      this.viewer.sectionBoxOn()
    } else {
      this.viewer.sectionBoxOff()
    }
    this.viewer.requestRender()
  }

  public addCameraUpdateEventListener(listener: (ev) => void) {
    this.viewer.getExtension(CameraController).on(CameraEvent.LateFrameUpdate, listener)
  }

  public constructor(parent: HTMLElement) {
    this.parent = parent
  }

  public async init() {
    if (this.viewer) return
    const viewerSettings = DefaultViewerParams
    viewerSettings.showStats = false
    viewerSettings.verbose = false
    const viewer = new LegacyViewer(this.parent, viewerSettings)
    await viewer.init()
    console.log('Viewer initialized', viewer);
    this.viewer = viewer
  }

  public async unloadObjects(
    objects: string[],
    signal?: AbortSignal,
    onObjectUnloaded?: (url: string) => void
  ) {
    for (const url of objects) {
      if (signal?.aborted) return
      await this.viewer
        .cancelLoad(url, true)
        .catch((e) => console.warn('Viewer Unload error', url, e))
        .finally(() => {
          if (this.loadedObjectsCache.has(url)) this.loadedObjectsCache.delete(url)
          if (onObjectUnloaded) onObjectUnloaded(url)
        })
    }
  }

  public async loadObjectsWithAutoUnload(
    objects: object[],
    onLoad: (url: string, index: number) => void,
    onError: (url: string, error: Error) => void,
    signal: AbortSignal
  ) {   
    // var objectsToUnload = _.difference([...this.loadedObjectsCache], rootObject)
    // await this.unloadObjects(objectsToUnload, signal)
    // await this.loadObjects(obj, onLoad, onError) // TODO: pass root object
    
    await this.loadObjects(objects, onLoad, onError)
  }

  public async loadObjects(
    objects: object[],
    onLoad: (url: string, index: number) => void,
    onError: (url: string, error: Error) => void
  ) {
    const stringifiedObject = JSON.stringify(objects)
    
    // // eslint-disable-next-line no-debugger
    // debugger
    
    const loader = new SpeckleOfflineLoader(this.viewer.getWorldTree(), stringifiedObject)
    void this.viewer.loadObject(loader, true)
  }

  public async intersect(coords: { x: number; y: number }) {
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
    if (!res) return null
    return {
      hit: pickViewableHit(res.objects, this.state),
      objects: res.objects
    }
  }
  public zoom(objectIds?: string[]) {
    this.viewer.zoom(objectIds)
  }

  public zoomExtents() {
    this.viewer.zoom()
  }
  public async unIsolateObjects() {
    if (this.state.isolatedObjects)
      this.state = await this.viewer.unIsolateObjects(this.state.isolatedObjects, 'powerbi', true)
  }

  public async isolateObjects(objectIds, ghost = false) {
    this.state = await this.viewer.isolateObjects(objectIds, 'powerbi', true, ghost)
  }

  public async colorObjectsByGroup(
    groups?: {
      objectIds: string[]
      color: string
    }[]
  ) {
    this.state = await this.viewer.setUserObjectColors(groups ?? [])
  }

  public async clear() {
    if (this.viewer) await this.viewer.unloadAll()
    this.loadedObjectsCache.clear()
  }

  public async selectObjects(objectIds: string[] = null) {
    if (!this.viewer) return
    await this.viewer.resetHighlight()
    const objIds = objectIds ?? []
    this.state = await this.viewer.selectObjects(objIds)
  }

  public getScreenPosition(worldPosition): { x: number; y: number } {
    return projectToScreen(
      this.viewer.getExtension(CameraController).renderingCamera as unknown as PerspectiveCamera | OrthographicCamera,
      worldPosition
    )
  }

  public dispose() {
    this.viewer.getExtension(CameraController).dispose()
    this.viewer.dispose()
    this.viewer = null
  }
}
