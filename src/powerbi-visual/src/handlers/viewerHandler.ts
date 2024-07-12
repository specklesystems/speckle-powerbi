import {
  CanonicalView,
  FilteringState,
  LegacyViewer,
  IntersectionQuery,
  DefaultViewerParams,
  Box3,
  SpeckleView,
  CameraController
} from '@speckle/viewer'
import { pickViewableHit, projectToScreen } from '../utils/viewerUtils'
import _ from 'lodash'
import { SpeckleVisualSettingsModel } from 'src/settings/visualSettingsModel'
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

    this.viewer.getExtension(CameraController).controls.maxPolarAngle = settings.camera
      .allowCameraUnder.value
      ? Math.PI
      : Math.PI / 2

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
        this.currentSectionBox = bbox
      } else {
        const bbox = this.viewer.getCurrentSectionBox()
        if (bbox) this.currentSectionBox = bbox
      }
      this.viewer.sectionBoxOn()
    } else {
      this.viewer.sectionBoxOff()
    }
    this.viewer.requestRender()
  }

  public addCameraUpdateEventListener(listener: (ev) => void) {
    this.viewer.getExtension(CameraController).controls.addEventListener('update', listener)
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
    this.viewer = viewer
  }

  public async unloadObjects(
    objectIds: string[],
    signal?: AbortSignal,
    onObjectUnloaded?: (url: string) => void
  ) {
    console.log('Unloading objects', objectIds)
    for (const speckleObjectId of objectIds) {
      if (signal?.aborted) return
      // TODO: Here's where the viewer unloads any objects that have been removed. It first ensures any loading is cancelled.
      // await this.viewer
      //   .cancelLoad(url, true)
      //   .catch((e) => console.warn('Viewer error while cancelling load', url, e))

      if (this.loadedObjectsCache.has(speckleObjectId))
        this.loadedObjectsCache.delete(speckleObjectId)
      if (onObjectUnloaded) onObjectUnloaded(speckleObjectId)
    }
  }

  public async loadObjectsWithAutoUnload(
    objects: any[],
    onLoad: (url: string, index: number) => void,
    onError: (url: string, error: Error) => void,
    signal: AbortSignal
  ) {
    var objectsToUnload = _.difference(
      [...this.loadedObjectsCache],
      objects.map((o) => o.id as string)
    )
    await this.unloadObjects(objectsToUnload, signal)
    await this.loadObjects(objects, onLoad, onError, signal)
  }

  public async loadObjects(
    objectsToLoad: any[],
    onLoad: (url: string, index: number) => void,
    onError: (url: string, error: Error) => void,
    signal: AbortSignal
  ) {
    console.log('Loading objects', objectsToLoad)
    try {
      //let index = 0
      let promises = []
      for (const speckleObject of objectsToLoad) {
        signal.throwIfAborted()
        console.log('Attempting to load', speckleObject.id, speckleObject)

        if (!this.loadedObjectsCache.has(speckleObject.id)) {
          console.log('Object is not in cache')

          // TODO: Here's were the viewer loads each object, this used to be done via URL but is now changed to use JSON objects instead (already deserialized)

          // const promise = this.viewer
          //   .loadObjectAsync(speckleObject, this.config.authToken, false)
          //   .then(() => onLoad(speckleObject.id, index++))
          //   .catch((e: Error) => onError(speckleObject, e))

          // promises.push(promise)

          // If batchSize has been reached, wait till all promises resolve before continuing
          if (promises.length == this.config.batchSize) {
            await Promise.all(promises)
            promises = []
          }

          if (!this.loadedObjectsCache.has(speckleObject.id))
            this.loadedObjectsCache.add(speckleObject.id)
        } else {
          console.log('Object was already in cache/already loaded')
        }
      }
      await Promise.all(promises)
    } catch (error) {
      if (error.name === 'AbortError') return
      throw new Error(`Load objects failed: ${error}`)
    }
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
      this.viewer.getExtension(CameraController).controls.camera,
      worldPosition
    )
  }

  public dispose() {
    this.viewer.getExtension(CameraController).controls.removeAllEventListeners()
    this.viewer.dispose()
    this.viewer = null
  }
}
