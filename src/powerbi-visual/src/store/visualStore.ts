import { CanonicalView, SpeckleView, ViewMode } from '@speckle/viewer'
import { Version } from '@src/composables/useUpdateConnector'
import { ColorBy, IViewerEvents } from '@src/plugins/viewer'
import { SpeckleVisualSettingsModel } from '@src/settings/visualSettingsModel'
import { SpeckleDataInput } from '@src/types'
import { ReceiveInfo } from '@src/utils/matrixViewUtils'
import { zipModelObjects } from '@src/utils/compression'
import { defineStore } from 'pinia'
import { Vector3 } from 'three'
import { computed, ref, shallowRef } from 'vue'

export type InputState = 'valid' | 'incomplete' | 'invalid'

export type FieldInputState = {
  rootObjectId: boolean
  objectIds: boolean
  colorBy: boolean
  tooltipData: boolean
}

export type LoadingProgress = { summary: string; progress: number; step?: string }

export const useVisualStore = defineStore('visualStore', () => {
  const latestAvailableVersion = ref<Version | null>(null)

  const host = shallowRef<powerbi.extensibility.visual.IVisualHost>()
  const formattingSettings = ref<SpeckleVisualSettingsModel>()
  const loadingProgress = ref<LoadingProgress>(undefined)
  const objectsFromStore = ref<object[][]>(undefined)

  // State tracking for toggle reset prevention
  const previousToggleState = ref<boolean | undefined>(undefined)

  const postFileSaveSkipNeeded = ref<boolean>(false)
  const postClickSkipNeeded = ref<boolean>(false)

  const isFilterActive = ref<boolean>(false)
  const isBrandingHidden = ref<boolean>(false)
  const isOrthoProjection = ref<boolean>(false)
  const isGhostActive = ref<boolean>(true)
  const isNavbarHidden = ref<boolean>(false)
  const isZoomOnFilterActive = ref<boolean>(true)

  const commonError = ref<string>(undefined)

  // once you see this shit, you might freak out and you are right. All of them needed because of "update" function trigger by API.
  // most of the time we need to know what we are doing to treat operations accordingly. Ask for more to me (Ogu), but the answers will make both of us unhappy.
  const isViewerInitialized = ref<boolean>(false)
  const isViewerReadyToLoad = ref<boolean>(false)
  const isViewerObjectsLoaded = ref<boolean>(false)
  const viewerReloadNeeded = ref<boolean>(false)
  const isLoadingFromFile = ref<boolean>(false)
  const receiveInfo = ref<ReceiveInfo>(undefined)
  const fieldInputState = ref<FieldInputState>({
    rootObjectId: false,
    objectIds: false,
    colorBy: false,
    tooltipData: false
  })
  const lastLoadedRootObjectId = ref<string>()

  const cameraPosition = ref<number[]>(undefined)
  const defaultViewModeInFile = ref<string>(undefined)
  const sectionBoxData = ref<string>(undefined)

  // Edges settings for view modes
  const edgesEnabled = ref<boolean>(true)
  const edgesWeight = ref<number>(1)
  const edgesColor = ref<number | 'auto'>('auto')

  const speckleViews = ref<SpeckleView[]>([])

  // callback mechanism to viewer to be able to manage input data accordingly.
  // Note: storing whole viewer in store is not make sense and also pinia ts complains about it for serialization issues.
  // Error was and you can not/should not compress: 👇
  // `The inferred type of this node exceeds the maximum length the compiler will serialize. An explicit type annotation is needed.ts(7056)`
  const viewerEmit =
    ref<
      <E extends keyof IViewerEvents>(event: E, ...payload: Parameters<IViewerEvents[E]>) => void
    >()

  // TODO: investigate about shallow ref? https://vuejs.org/api/reactivity-advanced.html#shallowref
  const dataInput = shallowRef<SpeckleDataInput | null>()
  const dataInputStatus = ref<InputState>('incomplete')
  const latestColorBy = ref<ColorBy[] | null | undefined>([])

  /**
   * Ideally one time setup on initialization.
   * @param hostToSet interaction layer with powerbi host. it is useful when you wanna trigger `launchUrl` kind functions. TODO: need more understanding.
   */
  const setHost = (hostToSet: powerbi.extensibility.visual.IVisualHost) => {
    host.value = hostToSet
  }

  const setReceiveInfo = (newReceiveInfo: ReceiveInfo) => {
    receiveInfo.value = newReceiveInfo
    
    // Always save receiveInfo to file for credentials persistence (contains token and metadata)
    // This ensures weak tokens are available even when desktop service is unavailable
    if (formattingSettings.value?.dataLoading.internalizeData.value && objectsFromStore.value) {
      // If internalize is ON and we have objects, save both objects and receiveInfo together
      writeObjectsToFile(objectsFromStore.value)
    } else {
      // Otherwise just save receiveInfo alone (credentials only)
      writeReceiveInfoToFile()
    }
  }

  const setLatestAvailableVersion = (version: Version | null) => {
    latestAvailableVersion.value = version
  }

  const isConnectorUpToDate = computed(() => {
    if (receiveInfo.value && receiveInfo.value.version) {
      return receiveInfo.value.version === latestAvailableVersion.value?.Number
    }
    return false
  })

  // detecting the env to control the visibility of update button
  // might use for different reasons in the future
  const isRunningInDesktop = computed(() => {
    // power bi hostEnv enum values:
    // web = 1, desktop = 4
    const hostEnv = host.value?.['hostEnv'] as number
    return hostEnv === 4
  })

  /**
   * Ideally one time set when onMounted of `ViewerWrapper.vue` component
   * @param emit picky emit function to trigger events under `IViewerEvents` interface
   */
  const setViewerEmitter = (
    emit: <E extends keyof IViewerEvents>(
      event: E,
      ...payload: Parameters<IViewerEvents[E]>
    ) => void
  ) => {
    if (emit) {
      viewerEmit.value = emit
      viewerEmit.value('ping', '✅ Emitter successfully attached to the store.')
      isViewerInitialized.value = true // this is needed to be delay first load at the visual.ts file
    }
  }

  const setObjectsFromStore = (newObjectsFromStore: object[][]) => {
    objectsFromStore.value = newObjectsFromStore
  }

  const setLoadingProgress = (summary: string, progress: number) => {
    loadingProgress.value = { summary, progress }
    if (loadingProgress.value.progress >= 1) {
      clearLoadingProgress()
    }
  }

  const filterColorByIdsForSelection = (colorByIds: ColorBy[] | null | undefined, selectedIds: string[]): ColorBy[] => {
    return colorByIds?.filter(colorGroup => {
      const filteredObjectIds = colorGroup.objectIds.filter(objId =>
        selectedIds.includes(objId)
      )
      if (filteredObjectIds.length > 0) {
        return { ...colorGroup, objectIds: filteredObjectIds }
      }
      return false
    }).map(colorGroup => ({
      ...colorGroup,
      objectIds: colorGroup.objectIds.filter(objId =>
        selectedIds.includes(objId)
      )
    })) || []
  }

  const clearLoadingProgress = () => {
    loadingProgress.value = undefined
  }

  // MAKE TS HAPPY
  type SpeckleObject = {
    id: string
  }

  const loadObjectsFromFile = async (objects: object[][]) => {
    console.log('📁 loadObjectsFromFile called with:', objects.length, 'models')
    const savedVersionObjectId = objects.map((o) => (o[0] as SpeckleObject).id).join(',')
    lastLoadedRootObjectId.value = savedVersionObjectId
    viewerReloadNeeded.value = false
    console.log(`📦 Loading viewer from cached data with ${lastLoadedRootObjectId.value} id.`)
    console.log('📁 About to call viewerEmit loadObjects...')
    await viewerEmit.value('loadObjects', objects)
    console.log('📁 viewerEmit loadObjects completed')
    objectsFromStore.value = objects
    isViewerObjectsLoaded.value = true
    viewerReloadNeeded.value = false
    setIsLoadingFromFile(false)
    console.log('📁 loadObjectsFromFile completed successfully')
  }

  const setIsLoadingFromFile = (newValue: boolean) => (isLoadingFromFile.value = newValue)


  /**
   * Sets upcoming data input into store to be able to pass it through viewer by evaluating the data.
   * @param newValue new data input that user dragged and dropped to the fields in visual
   */
  const setDataInput = async (newValue: SpeckleDataInput) => {
    dataInput.value = newValue

    if (viewerReloadNeeded.value) {
      const modelIds = dataInput.value.modelObjects.map((o) => (o[0] as SpeckleObject).id).join(',')
      lastLoadedRootObjectId.value = modelIds
      console.log(`🔄 Forcing viewer re-render for new root object id.`)
      await viewerEmit.value('loadObjects', dataInput.value.modelObjects)
      viewerReloadNeeded.value = false
      isViewerObjectsLoaded.value = true
      
      // Store the model objects for potential internalization
      if (dataInput.value.modelObjects && dataInput.value.modelObjects.length > 0) {
        console.log('📦 Storing modelObjects in visualStore for internalization:', dataInput.value.modelObjects.length, 'models')
        objectsFromStore.value = dataInput.value.modelObjects
      }
      
      // Note: Object internalization is now handled by toggle in visual.ts
      loadingProgress.value = undefined
    }

    if (dataInput.value.selectedIds.length > 0) {
      isFilterActive.value = true
      viewerEmit.value('filterSelection', dataInput.value.selectedIds, isGhostActive.value, isZoomOnFilterActive.value)

      // When filtering, only apply colors to the selected/isolated objects
      const filteredColorByIds = filterColorByIdsForSelection(dataInput.value.colorByIds, dataInput.value.selectedIds)
      viewerEmit.value('colorObjectsByGroup', filteredColorByIds)
    } else {
      isFilterActive.value = false
      latestColorBy.value = dataInput.value.colorByIds
      // Only apply filtering if object IDs are available, otherwise show all objects normally
      if (fieldInputState.value.objectIds && dataInput.value.objectIds && dataInput.value.objectIds.length > 0) {
        viewerEmit.value('resetFilter', dataInput.value.objectIds, isGhostActive.value, isZoomOnFilterActive.value)
      } else {
        // No object IDs provided - show all objects without any filtering
        viewerEmit.value('unIsolateObjects')
      }
      // When not filtering, apply all colors including conditional formatting
      viewerEmit.value('colorObjectsByGroup', dataInput.value.colorByIds)
    }
  }

  const writeObjectsToFile = (modelObjects: object[][]) => {
    // NOTE: need skipping the update function, it resets the viewer state unneccessarily.
    postFileSaveSkipNeeded.value = true
    const compressedChunks = zipModelObjects(modelObjects, 10000) // Compress in chunks

    host.value.persistProperties({
      merge: [
        {
          objectName: 'storedData',
          properties: {
            speckleObjects: compressedChunks,
            receiveInfo: JSON.stringify(receiveInfo.value) // Keep receiveInfo in sync when storing objects
          },
          selector: null
        }
      ]
    })
  }

  const writeReceiveInfoToFile = () => {
    // NOTE: need skipping the update function, it resets the viewer state unneccessarily.
    postFileSaveSkipNeeded.value = true

    host.value.persistProperties({
      merge: [
        {
          objectName: 'storedData',
          properties: {
            receiveInfo: JSON.stringify(receiveInfo.value)
          },
          selector: null
        }
      ]
    })
  }

  const writeCameraViewToFile = (view: CanonicalView) => {
    // NOTE: need skipping the update function, it resets the viewer state unneccessarily.
    postFileSaveSkipNeeded.value = true
    host.value.persistProperties({
      merge: [
        {
          objectName: 'camera',
          properties: {
            defaultView: view
          },
          selector: null
        }
      ]
    })
  }

  const writeIsOrthoToFile = () => {
    // NOTE: need skipping the update function, it resets the viewer state unneccessarily.
    postFileSaveSkipNeeded.value = true
    host.value.persistProperties({
      merge: [
        {
          objectName: 'camera',
          properties: {
            isOrtho: isOrthoProjection.value
          },
          selector: null
        }
      ]
    })
  }

  const writeIsGhostToFile = () => {
    // NOTE: need skipping the update function, it resets the viewer state unneccessarily.
    postFileSaveSkipNeeded.value = true
    host.value.persistProperties({
      merge: [
        {
          objectName: 'camera',
          properties: {
            isGhost: isGhostActive.value
          },
          selector: null
        }
      ]
    })
  }

  const writeZoomOnFilterToFile = () => {
    // NOTE: need skipping the update function, it resets the viewer state unneccessarily.
    postFileSaveSkipNeeded.value = true
    host.value.persistProperties({
      merge: [
        {
          objectName: 'camera',
          properties: {
            zoomOnFilter: isZoomOnFilterActive.value
          },
          selector: null
        }
      ]
    })
  }

  const writeViewModeToFile = (viewMode: ViewMode) => {
    // NOTE: need skipping the update function, it resets the viewer state unneccessarily.
    postFileSaveSkipNeeded.value = true
    host.value.persistProperties({
      merge: [
        {
          objectName: 'viewMode',
          properties: {
            defaultViewMode: viewMode
          },
          selector: null
        }
      ]
    })
  }

  const writeHideBrandingToFile = (brandingHidden: boolean) => {
    // NOTE: need skipping the update function, it resets the viewer state unneccessarily.
    postFileSaveSkipNeeded.value = true
    host.value.persistProperties({
      merge: [
        {
          objectName: 'workspace',
          properties: {
            brandingHidden: brandingHidden
          },
          selector: null
        }
      ]
    })
  }

  const writeNavbarVisibilityToFile = (navbarHidden: boolean) => {
    // NOTE: need skipping the update function, it resets the viewer state unneccessarily.
    postFileSaveSkipNeeded.value = true
    host.value.persistProperties({
      merge: [
        {
          objectName: 'viewMode',
          properties: {
            navbarHidden: navbarHidden
          },
          selector: null
        }
      ]
    })
  }

  const writeDataLoadingModeToFile = (internalizeData: boolean) => {
    // NOTE: need skipping the update function, it resets the viewer state unneccessarily.
    postFileSaveSkipNeeded.value = true
    host.value.persistProperties({
      merge: [
        {
          objectName: 'dataLoading',
          properties: {
            internalizeData: internalizeData
          },
          selector: null
        }
      ]
    })
  }

  const writeCameraPositionToFile = (position: Vector3, target: Vector3) => {
    // NOTE: need skipping the update function, it resets the viewer state unneccessarily.
    postFileSaveSkipNeeded.value = true
    host.value.persistProperties({
      merge: [
        {
          objectName: 'cameraPosition',
          properties: {
            positionX: position.x,
            positionY: position.y,
            positionZ: position.z,
            targetX: target.x,
            targetY: target.y,
            targetZ: target.z
          },
          selector: null
        }
      ]
    })
  }

  const writeSectionBoxToFile = (boxData: string | null) => {
    postFileSaveSkipNeeded.value = true
    host.value.persistProperties({
      merge: [
        {
          objectName: 'sectionBox',
          properties: {
            boxData: boxData
          },
          selector: null
        }
      ]
    })
  }

  const setSectionBoxData = (newValue: string) => (sectionBoxData.value = newValue)

  const setFieldInputState = (newFieldInputState: FieldInputState) =>
    (fieldInputState.value = newFieldInputState)

  const clearDataInput = () => (dataInput.value = null)


  const setViewerReadyToLoad = (newValue: boolean) => (isViewerReadyToLoad.value = newValue)

  const setViewerReloadNeeded = () => (viewerReloadNeeded.value = true)

  const toggleBranding = () => {
    isBrandingHidden.value = !isBrandingHidden.value
    writeHideBrandingToFile(isBrandingHidden.value)
  }

  const setBrandingHidden = (val: boolean) => {
    isBrandingHidden.value = val
  }

  const setNavbarHidden = (val: boolean) => {
    isNavbarHidden.value = val
  }

  const toggleNavbar = () => {
    isNavbarHidden.value = !isNavbarHidden.value
    writeNavbarVisibilityToFile(isNavbarHidden.value)
  }

  const setIsOrthoProjection = (val: boolean) => {
    isOrthoProjection.value = val
  }

  const setIsGhost = (val: boolean) => {
    isGhostActive.value = val
  }

  const setIsZoomOnFilterActive = (val: boolean) => {
    isZoomOnFilterActive.value = val
  }

  const setPostFileSaveSkipNeeded = (newValue: boolean) => (postFileSaveSkipNeeded.value = newValue)
  const setPostClickSkipNeeded = (newValue: boolean) => (postClickSkipNeeded.value = newValue)

  const setCameraPositionInFile = (newValue: number[]) => (cameraPosition.value = newValue)
  const setDefaultViewModeInFile = (newValue: string) => (defaultViewModeInFile.value = newValue)

  // Edges settings setters
  const setEdgesEnabled = (val: boolean) => {
    edgesEnabled.value = val
  }

  const setEdgesWeight = (val: number) => {
    edgesWeight.value = val
  }

  const setEdgesColor = (val: number | 'auto') => {
    edgesColor.value = val
  }

  const writeEdgesSettingsToFile = () => {
    // NOTE: need skipping the update function, it resets the viewer state unnecessarily.
    postFileSaveSkipNeeded.value = true
    host.value.persistProperties({
      merge: [
        {
          objectName: 'viewMode',
          properties: {
            edgesEnabled: edgesEnabled.value,
            edgesWeight: edgesWeight.value,
            edgesColor: edgesColor.value === 'auto' ? -1 : edgesColor.value
          },
          selector: null
        }
      ]
    })
  }

  const setSpeckleViews = (newSpeckleViews: SpeckleView[]) => (speckleViews.value = newSpeckleViews)
  const setFormattingSettings = (newFormattingSettings: SpeckleVisualSettingsModel) =>
    (formattingSettings.value = newFormattingSettings)

  const resetFilters = () => {
    // Only apply filtering if object IDs are available, otherwise show all objects normally
    if (fieldInputState.value.objectIds && dataInput.value && dataInput.value.objectIds && dataInput.value.objectIds.length > 0) {
      viewerEmit.value('resetFilter', dataInput.value.objectIds, isGhostActive.value, isZoomOnFilterActive.value)
    } else {
      // No object IDs provided - show all objects without any filtering
      viewerEmit.value('unIsolateObjects')
    }
    // When resetting filters, apply all colors including conditional formatting
    if (latestColorBy.value !== null) {
      viewerEmit.value('colorObjectsByGroup', latestColorBy.value)
    }
    isFilterActive.value = false
  }

  const downloadLatestVersion = () => {
    host.value.launchUrl(latestAvailableVersion.value?.Url as string)
  }

  const setCommonError = (error: string) => {
    commonError.value = error
  }

  const handleObjectsLoadedComplete = () => {
    console.log('🔄 Objects loaded - handling state restoration')
    
    // If we have current data input with selections, restore them
    if (dataInput.value) {
      console.log('🔄 Restoring selection state after object load')
      
      // Restore selection filters if they exist
      if (dataInput.value.selectedIds.length > 0) {
        isFilterActive.value = true
        viewerEmit.value('filterSelection', dataInput.value.selectedIds, isGhostActive.value, isZoomOnFilterActive.value)

        // When filtering, only apply colors to the selected/isolated objects
        const filteredColorByIds = filterColorByIdsForSelection(dataInput.value.colorByIds, dataInput.value.selectedIds)
        viewerEmit.value('colorObjectsByGroup', filteredColorByIds)
      } else {
        isFilterActive.value = false
        latestColorBy.value = dataInput.value.colorByIds
        // Only apply filtering if object IDs are available, otherwise show all objects normally
        if (fieldInputState.value.objectIds && dataInput.value.objectIds && dataInput.value.objectIds.length > 0) {
          viewerEmit.value('resetFilter', dataInput.value.objectIds, isGhostActive.value, isZoomOnFilterActive.value)
        } else {
          // No object IDs provided - show all objects without any filtering
          viewerEmit.value('unIsolateObjects')
        }

        // Restore color grouping for all objects when not filtering
        viewerEmit.value('colorObjectsByGroup', dataInput.value.colorByIds)
      }
    }
    
    // Trigger host data refresh to synchronize with Power BI
    host.value.refreshHostData()
  }

  // Toggle state tracking functions
  const setPreviousToggleState = (state: boolean) => {
    previousToggleState.value = state
  }

  return {
    host,
    receiveInfo,
    objectsFromStore,
    isViewerInitialized,
    isViewerReadyToLoad,
    isViewerObjectsLoaded,
    viewerReloadNeeded,
    dataInput,
    dataInputStatus,
    viewerEmit,
    fieldInputState,
    lastLoadedRootObjectId,
    loadingProgress,
    isLoadingFromFile,
    cameraPosition,
    defaultViewModeInFile,
    sectionBoxData,
    edgesEnabled,
    edgesWeight,
    edgesColor,
    speckleViews,
    postFileSaveSkipNeeded,
    postClickSkipNeeded,
    isFilterActive,
    latestColorBy,
    formattingSettings,
    isBrandingHidden,
    isOrthoProjection,
    isGhostActive,
    isNavbarHidden,
    isZoomOnFilterActive,
    latestAvailableVersion,
    isConnectorUpToDate,
    isRunningInDesktop,
    commonError,
    previousToggleState,
    setCommonError,
    setLatestAvailableVersion,
    setIsOrthoProjection,
    setIsGhost,
    setIsZoomOnFilterActive,
    setFormattingSettings,
    setBrandingHidden,
    setNavbarHidden,
    setPostClickSkipNeeded,
    setPostFileSaveSkipNeeded,
    setCameraPositionInFile,
    setDefaultViewModeInFile,
    setEdgesEnabled,
    setEdgesWeight,
    setEdgesColor,
    writeEdgesSettingsToFile,
    setSpeckleViews,
    loadObjectsFromFile,
    setHost,
    setReceiveInfo,
    setViewerReloadNeeded,
    setObjectsFromStore,
    writeObjectsToFile,
    writeCameraViewToFile,
    writeIsGhostToFile,
    writeZoomOnFilterToFile,
    writeIsOrthoToFile,
    writeViewModeToFile,
    writeCameraPositionToFile,
    writeSectionBoxToFile,
    setSectionBoxData,
    writeHideBrandingToFile,
    writeNavbarVisibilityToFile,
    writeDataLoadingModeToFile,
    toggleBranding,
    toggleNavbar,
    setViewerEmitter,
    setDataInput,
    setFieldInputState,
    clearDataInput,
    setViewerReadyToLoad,
    setLoadingProgress,
    clearLoadingProgress,
    setIsLoadingFromFile,
    resetFilters,
    downloadLatestVersion,
    handleObjectsLoadedComplete,
    setPreviousToggleState
  }
})
