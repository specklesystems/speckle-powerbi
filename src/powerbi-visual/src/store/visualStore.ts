import { CanonicalView, SpeckleView, ViewMode, Vector3Like } from '@src/viewer3/compatTypes'
import { Version } from '@src/composables/useUpdateConnector'
import { ColorBy, IViewerEvents } from '@src/plugins/viewer'
import { SpeckleVisualSettingsModel } from '@src/settings/visualSettingsModel'
import { SpeckleDataInput } from '@src/types'
import { ReceiveInfo } from '@src/utils/matrixViewUtils'
import {
  effectiveColorGroups,
  emptyOverridesFile,
  OverridesFile,
  parseOverridesFile,
  serializeOverridesFile,
  withOverride,
  withoutField,
  withoutOverride
} from '@src/utils/colorOverrides'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

export type InputState = 'valid' | 'incomplete' | 'invalid'

export type FieldInputState = {
  modelInfo: boolean
  applicationIds: boolean
  colorBy: boolean
  tooltipData: boolean
}

export type LoadingProgress = { summary: string; progress: number; step?: string }

export const useVisualStore = defineStore('visualStore', () => {
  const latestAvailableVersion = ref<Version | null>(null)

  const host = shallowRef<powerbi.extensibility.visual.IVisualHost>()
  const formattingSettings = ref<SpeckleVisualSettingsModel>()
  const loadingProgress = ref<LoadingProgress>(undefined)
  // Post-paint out-of-core streaming ticker (viewer:geomLoadStats) — shown as a
  // small pill, not the blocking overlay; null = streaming idle. mbPerSec is the
  // instantaneous rate (0 between response waves on slow links); totalMB is cumulative.
  const streamingStats = ref<{ mbPerSec: number; totalMB: number } | null>(null)

  // On-visual diagnostics HUD (Desktop has no reachable console): a live stats
  // line + the last significant events, toggled by clicking the status pill.
  const diagVisible = ref<boolean>(false)
  const diagStats = ref<string>('')
  const diagEvents = ref<string[]>([])
  const toggleDiag = () => (diagVisible.value = !diagVisible.value)
  const closeDiag = () => (diagVisible.value = false)
  const setDiagStats = (line: string) => (diagStats.value = line)
  const pushDiagEvent = (msg: string) => {
    const stamp = new Date().toLocaleTimeString(undefined, { hour12: false })
    diagEvents.value = [...diagEvents.value.slice(-39), `${stamp}  ${msg}`]
  }

  // Advanced Edit configuration page state. isAdvancedEditMode is synced from
  // options.editMode at the START of every visual update (enter/exit can arrive
  // as a non-Data update, ahead of all early returns). Dev mode gates ACCESS to
  // the diagnostics UI only — collection keeps running regardless.
  const isAdvancedEditMode = ref<boolean>(false)
  const setAdvancedEditMode = (val: boolean) => {
    if (val && !isAdvancedEditMode.value) closeDiag()
    isAdvancedEditMode.value = val
  }

  const isDevMode = ref<boolean>(false)
  // Set once the persisted value (or its confirmed absence) has been read, or
  // the user has toggled — the stale metadata echo of persistProperties() must
  // never overwrite the optimistic switch value.
  const isDevModeHydrated = ref<boolean>(false)
  const hydrateDevMode = (val: boolean) => {
    if (isDevModeHydrated.value) return
    isDevMode.value = val
    isDevModeHydrated.value = true
  }
  const setDevMode = (val: boolean) => {
    isDevMode.value = val
    isDevModeHydrated.value = true
    if (!val) closeDiag()
    writeDevModeToFile(val)
  }
  const writeDevModeToFile = (devMode: boolean) => {
    // NOTE: need skipping the update function, it resets the viewer state unneccessarily.
    postFileSaveSkipNeeded.value = true
    host.value.persistProperties({
      merge: [
        {
          objectName: 'config',
          properties: {
            devMode: devMode
          },
          selector: null
        }
      ]
    })
  }

  // ── Categorical Color-by overrides (Advanced Edit) ─────────────────────────
  // Sparse per-field mappings, persisted as ONE global JSON text property
  // (selector: null) — enumerable while values are absent from the data,
  // preserved independently per Color-by field, and copied with the visual.
  const colorOverrides = ref<OverridesFile>(emptyOverridesFile())
  // Same echo-protection as Dev mode: hydrate settles once; after that (or
  // after any user edit) the persistProperties() metadata echo must not
  // overwrite optimistic state.
  const isColorOverridesHydrated = ref<boolean>(false)
  // Inline persistence failure — the UI must never claim an unpersisted color.
  const colorOverridesError = ref<string | undefined>()

  const hydrateColorOverrides = (json?: string) => {
    if (isColorOverridesHydrated.value) return
    colorOverrides.value = parseOverridesFile(json)
    isColorOverridesHydrated.value = true
  }

  /** Optimistic commit: apply, persist immediately, roll back on failure. */
  const commitColorOverrides = (next: OverridesFile) => {
    if (next === colorOverrides.value) return
    const previous = colorOverrides.value
    colorOverrides.value = next
    isColorOverridesHydrated.value = true
    colorOverridesError.value = undefined
    try {
      // NOTE: need skipping the update function, it resets the viewer state unneccessarily.
      postFileSaveSkipNeeded.value = true
      host.value.persistProperties({
        merge: [
          {
            objectName: 'colorOverrides',
            properties: { mappings: serializeOverridesFile(next) },
            selector: null
          }
        ]
      })
    } catch (e) {
      console.error('Persisting color overrides failed', e)
      colorOverrides.value = previous
      colorOverridesError.value =
        'Saving color overrides failed. The last saved colors were restored.'
    }
    emitEffectiveColors()
  }

  const setColorOverride = (
    fieldKey: string,
    fieldDisplayName: string,
    valueKey: string,
    label: string,
    color: string
  ) =>
    commitColorOverrides(
      withOverride(colorOverrides.value, fieldKey, fieldDisplayName, valueKey, label, color)
    )

  const resetColorOverride = (fieldKey: string, valueKey: string) =>
    commitColorOverrides(withoutOverride(colorOverrides.value, fieldKey, valueKey))

  const resetAllColorOverrides = (fieldKey: string) =>
    commitColorOverrides(withoutField(colorOverrides.value, fieldKey))

  /**
   * The viewer's color channel for the current input: with Color By connected,
   * per-category effective colors (explicit override or automatic palette);
   * otherwise the object-level conditional-formatting groups untouched.
   */
  const currentColorGroups = (): ColorBy[] | null => {
    const input = dataInput.value
    if (!input) return null
    if (input.colorByCategories && input.colorByField) {
      return effectiveColorGroups(
        input.colorByCategories,
        colorOverrides.value.fields[input.colorByField.queryName]
      )
    }
    return input.colorByIds
  }

  /** Re-send colors after an override edit, honoring the active highlight state. */
  const emitEffectiveColors = () => {
    const input = dataInput.value
    if (!viewerEmit.value || !input) return
    const groups = currentColorGroups() ?? []
    // keep the resetFilters snapshot current even while a highlight narrows
    // the emitted subset — clearing the filter must restore FRESH colors
    latestColorBy.value = groups
    if (input.selectedIds.length > 0) {
      viewerEmit.value(
        'colorObjectsByGroup',
        filterColorByIdsForSelection(groups, input.selectedIds)
      )
    } else {
      viewerEmit.value('colorObjectsByGroup', groups)
    }
  }

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
  const receiveInfo = ref<ReceiveInfo>(undefined)
  const fieldInputState = ref<FieldInputState>({
    modelInfo: false,
    applicationIds: false,
    colorBy: false,
    tooltipData: false
  })
  // comma-joined versionIds of the currently loaded models — the reload key
  const lastLoadedVersionKey = ref<string>()

  // true object count of the loaded model(s), from the viewer's dictionaries —
  // the reference the filter discriminator compares the row universe against
  const totalObjectCount = ref<number>(0)
  const setTotalObjectCount = (n: number) => (totalObjectCount.value = n)

  // Filtered-data discriminator. jsonFilters covers slicers/filter pane; funnel
  // chart interactions surface ONLY as a shrunken-but-complete row universe, so
  // a complete universe smaller than the model also counts as filtered.
  const shouldApplyRowUniverseAsFilter = (): boolean => {
    const input = dataInput.value
    if (!input || !fieldInputState.value.applicationIds) return false
    if (!input.objectIds || input.objectIds.length === 0) return false
    if (input.hasActiveFilters) return true
    return (
      input.universeComplete &&
      totalObjectCount.value > 0 &&
      input.objectIds.length < totalObjectCount.value
    )
  }

  const cameraPosition = ref<number[]>(undefined)
  const defaultViewModeInFile = ref<string>(undefined)

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

    // Save receiveInfo to file for credentials persistence (contains token and metadata)
    writeReceiveInfoToFile()

    // The workspace logo is deliberately NOT in the Model Info blob (base64
    // data-URIs repeated per data row) — fetch it lazily via GraphQL instead.
    // Best-effort: the weak token may lack workspace scope; the avatar falls
    // back to the name initial.
    if (newReceiveInfo.workspaceId && !newReceiveInfo.workspaceLogo) {
      void (async () => {
        try {
          const resp = await fetch(`${newReceiveInfo.serverUrl}/graphql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${newReceiveInfo.token}`
            },
            body: JSON.stringify({
              query: 'query WorkspaceLogo($id: String!) { workspace(id: $id) { logo } }',
              variables: { id: newReceiveInfo.workspaceId }
            })
          })
          const body = (await resp.json()) as {
            data?: { workspace?: { logo?: string | null } }
          }
          const logo = body?.data?.workspace?.logo
          if (logo && receiveInfo.value?.workspaceId === newReceiveInfo.workspaceId) {
            receiveInfo.value = { ...receiveInfo.value, workspaceLogo: logo }
          }
        } catch {
          /* no logo — avatar shows the workspace initial */
        }
      })()
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

      // A fresh emitter means a fresh ViewerHandler/renderer with ZERO models.
      // Replay any valid input that arrived while the renderer was initializing,
      // as well as the current input after a focus/layout re-mount. Requiring a
      // lastLoadedVersionKey here drops the first load: that key is only assigned
      // inside setDataInput after loadModels can be emitted.
      if (dataInput.value?.modelInfos.length) {
        pushDiagEvent(
          lastLoadedVersionKey.value
            ? 'viewer re-initialized — forcing model reload'
            : 'viewer initialized — consuming pending model load'
        )
        viewerReloadNeeded.value = true
        void setDataInput(dataInput.value)
      }
    }
  }

  const setLoadingProgress = (summary: string, progress: number | null) => {
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

  const setStreamingStats = (stats: { mbPerSec: number; totalMB: number } | null) => {
    streamingStats.value = stats
  }

  /**
   * Sets upcoming data input into store to be able to pass it through viewer by evaluating the data.
   * @param newValue new data input that user dragged and dropped to the fields in visual
   */
  const setDataInput = async (newValue: SpeckleDataInput) => {
    dataInput.value = newValue

    // decode failures produce an empty input (commonError is set) and the
    // wrapper may not have attached the emitter yet — bail instead of
    // cascading TypeErrors ("viewerEmit.value is not a function")
    if (!viewerEmit.value || dataInput.value.modelInfos.length === 0) {
      return
    }

    // Identity mode travels with EVERY update, not just reloads: rebinding the
    // same model/version between Object Key and Application ID must switch the
    // viewer's resolution mode (and dictionary lifecycle) immediately.
    viewerEmit.value('setIdMode', dataInput.value.idMode)

    if (viewerReloadNeeded.value) {
      lastLoadedVersionKey.value = dataInput.value.versionKey
      await viewerEmit.value('loadModels', dataInput.value.modelInfos)
      viewerReloadNeeded.value = false
      isViewerObjectsLoaded.value = true
      loadingProgress.value = undefined
    }

    if (dataInput.value.selectedIds.length > 0) {
      isFilterActive.value = true
      // Highlights arrive on the row-capped dataview: on whale models the
      // highlighted subset is a SAMPLE of the real matching set (a filter-mode
      // interaction pages to the full result instead) — make that visible.
      if (!dataInput.value.hasActiveFilters && dataInput.value.objectIds.length >= 149000) {
        pushDiagEvent(
          `highlight on a row-capped sample (${dataInput.value.selectedIds.length} shown of the real matches) — ` +
            `chart clicks are a sampled preview on huge models; use a SLICER for exact isolation`
        )
      }
      viewerEmit.value('filterSelection', dataInput.value.selectedIds, isGhostActive.value, isZoomOnFilterActive.value)

      // When filtering, only apply colors to the selected/isolated objects
      const filteredColorByIds = filterColorByIdsForSelection(currentColorGroups(), dataInput.value.selectedIds)
      viewerEmit.value('colorObjectsByGroup', filteredColorByIds)
    } else {
      isFilterActive.value = false
      latestColorBy.value = currentColorGroups()
      // Apply the row universe as a filter only when the discriminator says the
      // data is genuinely filtered (jsonFilters, or a complete universe smaller
      // than the model) — a row-capped SAMPLE must never be applied.
      if (shouldApplyRowUniverseAsFilter()) {
        isFilterActive.value = true
        viewerEmit.value('resetFilter', dataInput.value.objectIds, isGhostActive.value, isZoomOnFilterActive.value)
      } else {
        // No active filters - show all objects without any filtering
        viewerEmit.value('unIsolateObjects')
      }
      // When not filtering, apply all colors including conditional formatting
      viewerEmit.value('colorObjectsByGroup', latestColorBy.value)
    }
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

  const writeCameraPositionToFile = (position: Vector3Like, target: Vector3Like) => {
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
    // The Reset button means "clear" — emit the explicit clear (setFilter(null) +
    // showAll) instead of re-filtering to the data view's id list, which on whale
    // models is a truncated sample and would HIDE most of the scene. If PBI-side
    // filters are still active, the next data update re-applies them via
    // resetFilter with the reduced row universe.
    viewerEmit.value('unIsolateObjects')
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
    // If we have current data input with selections, restore them
    if (dataInput.value) {
      // Restore selection filters if they exist
      if (dataInput.value.selectedIds.length > 0) {
        isFilterActive.value = true
        viewerEmit.value('filterSelection', dataInput.value.selectedIds, isGhostActive.value, isZoomOnFilterActive.value)

        // When filtering, only apply colors to the selected/isolated objects
        const filteredColorByIds = filterColorByIdsForSelection(currentColorGroups(), dataInput.value.selectedIds)
        viewerEmit.value('colorObjectsByGroup', filteredColorByIds)
      } else {
        isFilterActive.value = false
        latestColorBy.value = currentColorGroups()
        // Same discriminator as setDataInput (see the whale-sample note there)
        if (shouldApplyRowUniverseAsFilter()) {
          isFilterActive.value = true
          viewerEmit.value('resetFilter', dataInput.value.objectIds, isGhostActive.value, isZoomOnFilterActive.value)
        } else {
          // No active filters - show all objects without any filtering
          viewerEmit.value('unIsolateObjects')
        }

        // Restore color grouping for all objects when not filtering
        viewerEmit.value('colorObjectsByGroup', latestColorBy.value)
      }
    }
    
    // Trigger host data refresh to synchronize with Power BI
    host.value.refreshHostData()
  }

  return {
    host,
    receiveInfo,
    isViewerInitialized,
    isViewerReadyToLoad,
    isViewerObjectsLoaded,
    viewerReloadNeeded,
    dataInput,
    dataInputStatus,
    viewerEmit,
    fieldInputState,
    lastLoadedVersionKey,
    loadingProgress,
    cameraPosition,
    defaultViewModeInFile,
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
    setHost,
    setReceiveInfo,
    setViewerReloadNeeded,
    writeCameraViewToFile,
    writeIsGhostToFile,
    writeZoomOnFilterToFile,
    writeIsOrthoToFile,
    writeViewModeToFile,
    writeCameraPositionToFile,
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
    streamingStats,
    setStreamingStats,
    totalObjectCount,
    setTotalObjectCount,
    diagVisible,
    diagStats,
    diagEvents,
    toggleDiag,
    closeDiag,
    setDiagStats,
    pushDiagEvent,
    isAdvancedEditMode,
    setAdvancedEditMode,
    isDevMode,
    hydrateDevMode,
    setDevMode,
    colorOverrides,
    colorOverridesError,
    hydrateColorOverrides,
    setColorOverride,
    resetColorOverride,
    resetAllColorOverrides,
    resetFilters,
    downloadLatestVersion,
    handleObjectsLoadedComplete
  }
})
