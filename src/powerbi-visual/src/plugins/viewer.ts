import {
  DefaultViewerParams,
  FilteringState,
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
  SelectionEvent
} from '@speckle/viewer'
import { FilteredSelectionExtension, FilteredSelectionEvent } from '@src/extensions/FilteredSelectionExtension'
import { SpeckleObjectsOfflineLoader } from '@src/laoder/SpeckleObjectsOfflineLoader'
import { useVisualStore } from '@src/store/visualStore'
import { Tracker } from '@src/utils/mixpanel'
import { createNanoEvents, Emitter } from 'nanoevents'
import { Vector3 } from 'three'
import type { ModelContextSettings } from '@src/types'

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
  objectClicked: (hit: Hit | null, isMultiSelect: boolean, mouseEvent?: PointerEvent) => void
  applyContextMode: (rootObjectId: string, settings: ModelContextSettings) => void
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
  public selection: FilteredSelectionExtension
  private filteringState: FilteringState
  public modelObjectsMap: Map<string, Set<string>> = new Map()
  private lockedObjects: Set<string> = new Set()

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
    this.emitter.on('applyContextMode', this.applyContextMode)
  }

  async init(parent: HTMLElement) {
    this.viewer = await createViewer(parent)
    this.cameraControls = this.viewer.getExtension(CameraController)
    this.filtering = this.viewer.getExtension(FilteringExtension)
    this.selection = this.viewer.getExtension(FilteredSelectionExtension)

    // provide locked objects to selection extension
    this.selection.setLockedObjectsGetter(() => this.lockedObjects)

    const store = useVisualStore()
    if (store.isOrthoProjection) {
      this.cameraControls.toggleCameras()
    }

    this.viewer.on(ViewerEvent.LoadComplete, (arg: string) => {
      store.clearLoadingProgress()
    })

    // Set up event listener for viewer's built-in object clicked events
    this.viewer.on(ViewerEvent.ObjectClicked, (selection: SelectionEvent | null) => {
      console.log('🎯 Viewer ObjectClicked event received:', selection)
    })

    // Set up event listener for filtered selection events
    this.selection.on(FilteredSelectionEvent.FilteredObjectClicked, this.handleFilteredSelection)
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
    console.log('🔗 Handling filterSelection inside ViewerHandler')
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



  public loadObjects = async (modelObjects: object[][]) => {
    await this.viewer.unloadAll()
    // const stringifiedObject = JSON.stringify(objects)

    const store = useVisualStore()
    const speckleViews = []

    // clear existing model objects map
    this.modelObjectsMap.clear()

    // get model metadata to map objects to models
    const modelMetadata = store.modelMetadata

    // Use for...of loop to properly handle async operations
    for (let i = 0; i < modelObjects.length; i++) {
      const objects = modelObjects[i]
      //@ts-ignore
      const loader = new SpeckleObjectsOfflineLoader(this.viewer.getWorldTree(), objects)

      const speckleViewsInModel = objects.filter(
        //@ts-ignore
        (o) => o.speckle_type === 'Objects.BuiltElements.View:Objects.BuiltElements.View3D'
      ) as SpeckleView[]
      speckleViews.concat(speckleViewsInModel)

      // track which objects belong to which model
      if (modelMetadata[i]) {
        const rootObjectId = modelMetadata[i].rootObjectId
        const objectIds = new Set<string>()

        // find root object and extract name
        const rootObject = objects.find((obj: any) => obj.id === rootObjectId)
        if (rootObject && (rootObject as any).name) {
          modelMetadata[i].modelName = (rootObject as any).name
        }

        // collect all object IDs from this model
        objects.forEach((obj: any) => {
          if (obj.id) {
            objectIds.add(obj.id)
          }
        })

        this.modelObjectsMap.set(rootObjectId, objectIds)
        console.log(`📦 Mapped ${objectIds.size} objects to root object: ${rootObjectId} (${modelMetadata[i].modelName})`)
      }

      // Since you are setting another camera position, maybe you want the second argument to false
      await this.viewer.loadObject(loader, true)
      this.viewer.getRenderer().shadowcatcher.shadowcatcherMesh.visible = false // works fine only right after loadObjects

      // Clean up loader resources after loading is complete
      if (loader.dispose) {
        await loader.dispose()
      }
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

  private handleFilteredSelection = (selection: SelectionEvent | null) => {
    console.log('🎯 Filtered selection event received:', selection)

    let hit: Hit | null = null
    let isMultiSelect = false
    let mouseEvent: PointerEvent | undefined = undefined

    if (selection && selection.hits.length > 0) {
      // Convert the first hit to the Hit format expected by ViewerWrapper
      const firstHit = selection.hits[0]
      hit = {
        guid: firstHit.node.model.id,
        object: firstHit.node.model.raw,
        point: {
          x: firstHit.point.x,
          y: firstHit.point.y,
          z: firstHit.point.z
        }
      }
      isMultiSelect = selection.multiple
      mouseEvent = selection.event
    }

    // Emit the objectClicked event for ViewerWrapper to handle
    this.emit('objectClicked', hit, isMultiSelect, mouseEvent)
  }

  public applyContextMode = (rootObjectId: string, settings: ModelContextSettings) => {

    const store = useVisualStore()
    const allVisibleObjects: string[] = []
    const allHiddenObjects: string[] = []

    // clear and rebuild locked objects set
    this.lockedObjects.clear()

    // collect objects of visible and hidden models
    for (const [objId, objectIds] of this.modelObjectsMap.entries()) {
      const modelSettings = store.getModelContextSettings(objId)
      const objectIdsArray = Array.from(objectIds)

      if (modelSettings.visible) {
        allVisibleObjects.push(...objectIdsArray)
        // track locked objects
        if (modelSettings.locked) {
          objectIdsArray.forEach((id) => this.lockedObjects.add(id))
        }
      } else {
        allHiddenObjects.push(...objectIdsArray)
      }
    }

    // first unisolate all objects to reset state
    const allObjects = [...allVisibleObjects, ...allHiddenObjects]
    if (allObjects.length > 0) {
      this.filtering.unIsolateObjects(allObjects, 'context-mode', true)
    }

    // hide the hidden objects
    if (allHiddenObjects.length > 0) {
      this.filtering.hideObjects(allHiddenObjects, 'context-mode', true)
    }

    // Request to update the view
    this.viewer.requestRender(UpdateFlags.RENDER_RESET)
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
  viewer.createExtension(FilteringExtension) // filtering - must be created before FilteredSelectionExtension
  viewer.createExtension(FilteredSelectionExtension) // filtered selection helper - depends on FilteringExtension
  // viewer.createExtension(SectionTool) // section tool, possibly not needed for now?
  // viewer.createExtension(SectionOutlines) // section tool, possibly not needed for now?
  // viewer.createExtension(MeasurementsExtension) // measurements, possibly not needed for now?
  viewer.createExtension(ViewModes) // view modes

  console.log('🎥 Viewer is created!')
  return viewer
}
