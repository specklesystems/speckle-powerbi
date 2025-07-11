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
  ViewerEvent,
  ObjectLayers
} from '@speckle/viewer'
import { SpeckleObjectsOfflineLoader } from '@src/laoder/SpeckleObjectsOfflineLoader'
import { useVisualStore } from '@src/store/visualStore'
import { Tracker } from '@src/utils/mixpanel'
import { createNanoEvents, Emitter } from 'nanoevents'
import { Vector3, Vector2 } from 'three'

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
  resetFilter: (objectIds: string[], ghost: boolean, zoom: boolean) => void
  filterSelection: (objectIds: string[], ghost: boolean, zoom: boolean) => void
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
  objectsLoaded: () => void
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
    this.emitter.on('objectsLoaded', this.handleObjectsLoaded)
    this.emitter.on('toggleProjection', this.toggleProjection)
    this.emitter.on('toggleGhostHidden', this.toggleGhostHidden)
  }

  async init(parent: HTMLElement) {
    this.viewer = await createViewer(parent)
    this.cameraControls = this.viewer.getExtension(CameraController)
    this.filtering = this.viewer.getExtension(FilteringExtension)
    this.selection = this.viewer.getExtension(SelectionExtension)

    // Override the SelectionExtension's click handler to apply our filtering
    this.viewer.on(ViewerEvent.ObjectClicked, this.onViewerObjectClicked.bind(this))

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

  public filterSelection = (objectIds: string[], ghost: boolean, zoom: boolean = true) => {
    console.log('🔗 Handling filterSelection inside ViewerHandler')
    if (objectIds) {
      this.unIsolateObjects()
      this.filteringState = this.filtering.isolateObjects(objectIds, 'powerbi', true, ghost)
      if (zoom) {
        this.zoomObjects(objectIds, true)
      }
    }
  }

  public resetFilter = (objectIds: string[], ghost: boolean, zoom: boolean = true) => {
    console.log('🔗 Handling resetFilter inside ViewerHandler')
    if (objectIds) {
      this.isolateObjects(objectIds, ghost)
      if (zoom) {
        this.zoomObjects(objectIds, true)
      }
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
    const camera = this.viewer.getRenderer().renderingCamera
    if (!camera) {
      this.selection.clearSelection()
      return
    }

    // Convert screen coordinates to NDC
    const point = this.viewer.Utils.screenToNDC(coords.x, coords.y)

    // Use the renderer's intersection method directly to get detailed results
    const results = this.viewer.getRenderer().intersections.intersect(
      this.viewer.getRenderer().scene,
      camera,
      new Vector2(point.x, point.y),
      [
        ObjectLayers.STREAM_CONTENT_MESH,
        ObjectLayers.STREAM_CONTENT_POINT,
        ObjectLayers.STREAM_CONTENT_LINE,
        ObjectLayers.STREAM_CONTENT_TEXT
      ],
      true,
      this.viewer.getRenderer().clippingVolume
    )
    
    if (!results || results.length === 0) {
      this.selection.clearSelection()
      return
    }

    // Filter out hidden and ghosted objects
    const filteredResults = results.filter((intersection) => {
      if (intersection.batchObject) {
        try {
          // Cast to the proper type that has getBatchObjectMaterial method
          const material = (intersection.object as any).getBatchObjectMaterial(intersection.batchObject)
          // Simple approach: only keep materials that are visible
          // Hidden and ghosted materials should have visible: false
          return material && material.visible
        } catch (error) {
          return true
        }
      }
      return true
    })

    if (filteredResults.length === 0) {
      this.selection.clearSelection()
      return
    }

    // Convert the filtered result to the format expected by the rest of the code
    const hits = this.viewer.getRenderer().queryHits(filteredResults)
    
    if (!hits || hits.length === 0) {
      this.selection.clearSelection()
      return
    }

    // Additional filtering based on isolation state
    let validHits = hits
    
    // Use extension filtering state as fallback if local state is out of sync
    const currentFilteringState = this.filteringState || this.filtering?.filteringState
    const isolatedObjects = currentFilteringState?.isolatedObjects || []
    
    if (isolatedObjects && isolatedObjects.length > 0) {
      validHits = hits.filter(hit => {
        return isolatedObjects.includes(hit.node.model.id)
      })
    }

    if (validHits.length === 0) {
      this.selection.clearSelection()
      return
    }

    // Use the first valid hit
    const hit = validHits[0]
    
    return {
      hit: {
        guid: hit.node.model.id,
        object: hit.node.model.raw,
        point: hit.point
      },
      objects: validHits.map(h => ({
        guid: h.node.model.id,
        object: h.node.model.raw,
        point: h.point
      }))
    }
  }

  public loadObjects = async (modelObjects: object[][]) => {
    await this.viewer.unloadAll()
    // const stringifiedObject = JSON.stringify(objects)

    const store = useVisualStore()
    const speckleViews = []

    // Use for...of loop to properly handle async operations
    for (const objects of modelObjects) {
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
    }

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
    
    // Emit objects loaded event to trigger update
    this.emit('objectsLoaded')
  }

  private handlePing = (message: string) => {
    console.log(message)
  }

  private handleObjectsLoaded = () => {
    console.log('🎯 Objects loaded - triggering update')
    const store = useVisualStore()
    // Handle state restoration after objects are loaded
    store.handleObjectsLoadedComplete()
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

  public onViewerObjectClicked = (selectionEvent: any) => {
    if (!selectionEvent || !selectionEvent.hits || selectionEvent.hits.length === 0) {
      // No selection or no hits - let the SelectionExtension handle it normally
      return
    }

    // Apply the same isolation filtering as in our intersect method
    const currentFilteringState = this.filteringState || this.filtering?.filteringState
    const isolatedObjects = currentFilteringState?.isolatedObjects || []

    if (isolatedObjects && isolatedObjects.length > 0) {
      // Filter hits to only include isolated objects
      const filteredHits = selectionEvent.hits.filter(hit => {
        return isolatedObjects.includes(hit.node.model.id)
      })

      if (filteredHits.length === 0) {
        // Block the selection by calling the SelectionExtension with null
        this.selection.clearSelection()
        return
      }

      // Update the selection event with filtered hits
      selectionEvent.hits = filteredHits
    }

    // Let the original SelectionExtension handle the (potentially filtered) selection event
    // We don't need to call anything here as the SelectionExtension will process it next
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
