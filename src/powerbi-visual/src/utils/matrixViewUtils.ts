import powerbi from 'powerbi-visuals-api'
import { IViewerTooltip, IViewerTooltipData, SpeckleDataInput } from '../types'
import { formattingSettings as fs } from 'powerbi-visuals-utils-formattingmodel'
import {
  createDataViewWildcardSelector,
  DataViewWildcardMatchingOption
} from 'powerbi-visuals-utils-dataviewutils/lib/dataViewWildcard'
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions
import { SpeckleVisualSettingsModel } from 'src/settings/visualSettingsModel'
import { FieldInputState, useVisualStore } from '@src/store/visualStore'
import { delay } from 'lodash'
import { getSlugFromHostAppNameAndVersion } from './hostAppSlug'
import { useUpdateConnector } from '@src/composables/useUpdateConnector'
import { SpeckleApiLoader } from '@src/loader/SpeckleApiLoader'
import { unzipModelObjects } from './compression'

export class AsyncPause {
  private lastPauseTime = 0
  public needsWait = false

  public tick(maxDelta: number) {
    const now = performance.now()
    const delta = now - this.lastPauseTime
    // console.log('Delta -> ', delta)
    if (delta > maxDelta) {
      this.needsWait = true
    }
  }

  public async wait(waitTime: number) {
    this.lastPauseTime = performance.now()
    await new Promise((resolve) => setTimeout(resolve, waitTime))
    this.needsWait = false
  }
}

export function validateMatrixView(options: VisualUpdateOptions): FieldInputState {
  const matrixVew = options.dataViews[0].matrix

  let hasRootObjectId = false,
    hasObjectIds = false,
    hasColorFilter = false,
    hasTooltipData = false

  matrixVew.valueSources.forEach((level) => {
    if (!hasRootObjectId) hasRootObjectId = level.roles['rootObjectId'] != undefined
  })

  matrixVew.rows.levels.forEach((level) => {
    level.sources.forEach((source) => {
      if (!hasObjectIds) hasObjectIds = source.roles['objectIds'] != undefined
      if (!hasColorFilter) hasColorFilter = source.roles['colorBy'] != undefined
    })
  })

  matrixVew.columns.levels.forEach((level) => {
    level.sources.forEach((source) => {
      if (!hasTooltipData) hasTooltipData = source.roles['tooltipData'] != undefined
    })
  })

  return {
    rootObjectId: hasRootObjectId,
    objectIds: hasObjectIds,
    colorBy: hasColorFilter,
    tooltipData: hasTooltipData
  }
}

function processObjectValues(
  objectIdChild: powerbi.DataViewMatrixNode,
  matrixView: powerbi.DataViewMatrix
) {
  const objectData: IViewerTooltipData[] = []
  let shouldColor = true,
    shouldSelect = false

  if (objectIdChild.values)
    Object.keys(objectIdChild.values).forEach((key) => {
      const value: powerbi.DataViewMatrixNodeValue = objectIdChild.values[key]
      const k: unknown = key
      const colInfo = matrixView.valueSources[k as number]
      const highLightActive = value.highlight !== undefined
      if (highLightActive) {
        shouldColor = false
      }
      const isHighlighted = value.highlight !== null

      if (highLightActive && isHighlighted) {
        shouldSelect = true
        shouldColor = true
      }
      const propData: IViewerTooltipData = {
        displayName: colInfo.displayName.replace('First ', ''),
        value: value.value === null ? '<not set>' : value.value.toString()
      }
      objectData.push(propData)
    })
  return {
    data: objectData.length > 0 ? objectData.slice(1) : [],
    shouldColor,
    shouldSelect
  }
}

function processObjectNode(
  objectIdChild: powerbi.DataViewMatrixNode,
  host: powerbi.extensibility.visual.IVisualHost,
  matrixView: powerbi.DataViewMatrix
): {
  data: IViewerTooltipData[]
  shouldColor: boolean
  shouldSelect: boolean
  id: string
  selectionId: powerbi.visuals.ISelectionId
  color?: string
} {
  const objId = objectIdChild.value as string
  // Create selection IDs for each object
  const nodeSelection = host
    .createSelectionIdBuilder()
    .withMatrixNode(objectIdChild, matrixView.rows.levels)
    .createSelectionId()
  // Create value records for the tooltips
  const objectValues = processObjectValues(objectIdChild, matrixView)
  const res = { id: objId, selectionId: nodeSelection, color: undefined, ...objectValues }
  // Process node objects, if any.
  if (objectIdChild.objects) {
    //@ts-ignore
    const color = objectIdChild.objects.color.fill.solid.color as string
    console.log('⚠️ HAS objects', color)
    if (color) {
      res.color = color
      // Don't override shouldColor for conditional formatting - keep the selection state
      // res.shouldColor = true  // REMOVED: This was overriding cross-filter selection state
    }
  }
  return res
}

function processObjectIdLevel(
  parentObjectIdChild: powerbi.DataViewMatrixNode,
  host: powerbi.extensibility.visual.IVisualHost,
  matrixView: powerbi.DataViewMatrix
) {
  return processObjectNode(parentObjectIdChild, host, matrixView)
}

export let previousPalette = null

export function resetPalette() {
  previousPalette = null
}

export type ReceiveInfo = {
  userEmail: string
  serverUrl: string
  sourceApplication?: string
  workspaceId?: string
  workspaceLogo?: string
  workspaceName?: string
  canHideBranding: boolean
  version?: string
  token: string
  projectId?: string
}

async function getReceiveInfo(id) {
  try {
    const ids = (id as string).split(',')
    const response = await fetch(`http://localhost:29364/user-info/${ids[0]}`)
    if (!response.body) {
      console.error('No response body')
      return { desktopServiceError: true }
    }

    return await response.json()
  } catch (error) {
    console.log(error)
    console.log("User info couldn't retrieved from local server.")
    return { desktopServiceError: true }
  }
}

async function fetchFromSpeckleApi(
  objectIds: string,
  serverUrl: string,
  projectId: string,
  token: string
): Promise<object[][]> {
  const ids = objectIds.split(',')
  const modelObjects = []

  for (const objectId of ids) {
    try {
      console.log(`Downloading from Speckle API: ${objectId}`)
      const loader = new SpeckleApiLoader(serverUrl, projectId, token)
      const objects = await loader.downloadObjectsWithChildren(objectId)
      modelObjects.push(objects)
      console.log(`Downloaded ${objects.length} objects from Speckle`)
    } catch (error) {
      console.error(`Failed to download objects from Speckle:`, error)
      throw error
    }
  }

  return modelObjects
}

export async function processMatrixView(
  matrixView: powerbi.DataViewMatrix,
  host: powerbi.extensibility.visual.IVisualHost,
  hasColorFilter: boolean,
  settings: SpeckleVisualSettingsModel,
  onSelectionPair: (objId: string, selectionId: powerbi.extensibility.ISelectionId) => void,
  internalizedData?: string
): Promise<SpeckleDataInput> {
  const visualStore = useVisualStore()
  const objectIds = [],
    selectedIds = [],
    colorByIds = [],
    objectTooltipData = new Map<string, IViewerTooltip>()

  console.log('🪜 Processing Matrix View', matrixView)

  const localMatrixView = matrixView.rows.root.children
  let id = null

  // Safety check for matrix data structure
  if (!localMatrixView || localMatrixView.length === 0) {
    throw new Error('Matrix view has no data rows')
  }

  try {
    if (hasColorFilter) {
      if (
        !localMatrixView[0].children ||
        localMatrixView[0].children.length === 0 ||
        !localMatrixView[0].children[0].values
      ) {
        throw new Error('Matrix view structure is incomplete for color filter mode')
      }
      id = localMatrixView[0].children[0].values[0].value as unknown as string
    } else {
      if (!localMatrixView[0].values || !localMatrixView[0].values[0]) {
        throw new Error('Matrix view structure is incomplete for normal mode')
      }
      id = localMatrixView[0].values[0].value as unknown as string
    }
  } catch (error) {
    console.error('Error accessing matrix data:', error)
    throw new Error(`Failed to extract root object ID from matrix: ${error.message}`)
  }

  // Check for internalized data but ONLY if it matches current matrix data
  let internalizedModelObjects: object[][] | undefined = undefined
  if (settings.dataLoading.internalizeData.value && internalizedData) {
    console.log('📁 Checking internalized data in processMatrixView')

    try {
      internalizedModelObjects = unzipModelObjects(internalizedData)

      if (internalizedModelObjects && internalizedModelObjects.length > 0) {
        // CRITICAL: Validate that internalized data matches current matrix data
        const internalizedRootId = (internalizedModelObjects[0][0] as any).id
        if (internalizedRootId !== id) {
          console.log(
            `📁 Internalized data mismatch: stored=${internalizedRootId}, current=${id}. Using fresh data.`
          )
          internalizedModelObjects = undefined // Clear internalized data - use fresh data instead
        } else {
          console.log(
            '📁 Successfully validated internalized data matches current matrix:',
            internalizedModelObjects.length,
            'models'
          )
        }
      }

      if (internalizedModelObjects && internalizedModelObjects.length > 0) {
        // Set dummy receiveInfo to prevent UI errors
        if (!visualStore.receiveInfo) {
          visualStore.setReceiveInfo({
            userEmail: 'offline@speckle.systems',
            serverUrl: 'offline',
            sourceApplication: 'PowerBI Offline',
            workspaceId: 'offline',
            workspaceName: 'Offline Workspace',
            workspaceLogo: '',
            version: '1.0.0',
            canHideBranding: false,
            token: 'offline',
            projectId: 'offline'
          })
        }

        // Only reload if switching models or not already loaded
        const needsReload =
          !visualStore.isViewerObjectsLoaded || visualStore.lastLoadedRootObjectId !== id
        if (needsReload) {
          console.log('🔄 Forcing viewer reload for internalized data (model switch or first load)')
          visualStore.setViewerReloadNeeded()
          visualStore.setViewerReadyToLoad(true)
          visualStore.setLoadingProgress('📁 Loading from file', null)
        } else {
          console.log('📁 Internalized data already loaded, skipping reload')
        }
        visualStore.lastLoadedRootObjectId = id // Set to current ID to skip API calls
      } else {
        console.error('📁 Failed to unzip internalized data')
      }
    } catch (error) {
      console.error('📁 Error processing internalized data:', error)
    }
  }

  // const id = localMatrixView[0].values[0].value as unknown as string
  console.log('🗝️ Root Object Id: ', id)
  console.log('Last laoded root object id', visualStore.lastLoadedRootObjectId)

  let modelObjects: object[][] = undefined

  if (
    visualStore.lastLoadedRootObjectId !== id &&
    !visualStore.isLoadingFromFile &&
    !internalizedModelObjects
  ) {
    const start = performance.now()

    // Get receive info from desktop service to populate visual store
    const receiveInfo = await getReceiveInfo(id)
    let desktopServiceUnavailable = false

    if (receiveInfo && !receiveInfo.desktopServiceError) {
      visualStore.setReceiveInfo({
        userEmail: receiveInfo.email || receiveInfo.Email,
        serverUrl: receiveInfo.server || receiveInfo.Server,
        sourceApplication: getSlugFromHostAppNameAndVersion(
          receiveInfo.sourceApplication || receiveInfo.SourceApplication
        ),
        workspaceId: receiveInfo.workspaceId || receiveInfo.WorkspaceId,
        workspaceName: receiveInfo.workspaceName || receiveInfo.WorkspaceName,
        workspaceLogo: receiveInfo.workspaceLogo || receiveInfo.WorkspaceLogo,
        version: receiveInfo.version || receiveInfo.Version,
        canHideBranding: receiveInfo.canHideBranding ?? receiveInfo.CanHideBranding,
        token: receiveInfo.weakToken || receiveInfo.WeakToken,
        projectId: receiveInfo.projectId || receiveInfo.ProjectId
      })
      console.log(`Receive info retrieved from desktop service - credentials loaded`)
    } else {
      desktopServiceUnavailable = true
      console.log('Desktop service unavailable - cannot retrieve credentials')
    }

    // parse model metadata for federated models
    if (id.includes(',')) {
      const modelIds = id.split(',')
      const metadata = modelIds.map((modelId) => {
        return {
          modelId: modelId,
          modelName: modelId // TODO: use model name instead, this is just a placeholder for now
        }
      })
      visualStore.setModelMetadata(metadata)
      console.log('Federated model detected. Model metadata:', metadata)
    }

    // Now get the data from visual store for Speckle API download
    const token = visualStore.receiveInfo?.token
    const serverUrl = visualStore.receiveInfo?.serverUrl
    const projectId = visualStore.receiveInfo?.projectId

    if (!token || !serverUrl || !projectId) {
      if (desktopServiceUnavailable) {
        visualStore.setCommonError(
          'Speckle Desktop Service is not running. Please start Speckle Desktop Services and refresh data.'
        )
      } else {
        visualStore.setCommonError(
          'Missing Speckle credentials. Please refresh the data from the data connector.'
        )
      }
      visualStore.setViewerReadyToLoad(false)
      return {
        modelObjects: [],
        objectIds: [],
        selectedIds: [],
        colorByIds: null,
        objectTooltipData: new Map(),
        isFromStore: false
      }
    }

    visualStore.setViewerReadyToLoad(true)

    console.log('Downloading objects directly from Speckle API...')
    console.log(`Server: ${serverUrl}, Project: ${projectId}, Object: ${id}`)
    try {
      modelObjects = await fetchFromSpeckleApi(id, serverUrl, projectId, token)
      console.log('Successfully downloaded from Speckle API')

      // Debug: Check what we're passing to the viewer
      if (modelObjects && modelObjects.length > 0 && modelObjects[0].length > 0) {
        console.log('ModelObjects structure:', {
          totalModels: modelObjects.length,
          firstModelObjectCount: modelObjects[0].length,
          firstObject: modelObjects[0][0]
        })
      }
    } catch (error) {
      console.error('Failed to download from Speckle API:', error)
      visualStore.setCommonError(`Failed to download objects from Speckle: ${error.message}`)
      visualStore.setViewerReadyToLoad(false)
      return {
        modelObjects: [],
        objectIds: [],
        selectedIds: [],
        colorByIds: null,
        objectTooltipData: new Map(),
        isFromStore: false
      }
    }

    visualStore.setViewerReloadNeeded() // they should be marked as deferred action bc of update function complexity.
    visualStore.setLoadingProgress('🌍 Loading objects into viewer', null)
    console.log(`🚀 Upload is completed in ${(performance.now() - start) / 1000} s!`)
  }

  if (visualStore.receiveInfo && visualStore.receiveInfo.version) {
    const { checkUpdate } = useUpdateConnector()
    await checkUpdate()
  }

  // If colors assigned, data arrives nested
  if (hasColorFilter) {
    // const start = performance.now()
    // console.log('Sorting the colors started...')
    // // powerbi sorts the objects alphabetically for color legends
    // const sortedMatrix = localMatrixView.sort((a, b) => {
    //   return (a.levelValues[0].value as string).localeCompare(b.levelValues[0].value as string)
    // })
    // const end = performance.now()
    // console.log(`Sorted in: ${(end - start) / 1000} s`)

    if (previousPalette) host.colorPalette['colorPalette'] = previousPalette

    localMatrixView.forEach((colorObjects) => {
      colorObjects.children.forEach((obj) => {
        const colorSelectionId = host
          .createSelectionIdBuilder()
          .withMatrixNode(obj, matrixView.rows.levels)
          .createSelectionId()

        const value = colorObjects.value as string
        const color = host.colorPalette.getColor(value)
        const colorSlice = new fs.ColorPicker({
          name: 'selectorFill',
          displayName: value,
          value: {
            value: color.value
          },
          selector: colorSelectionId.getSelector()
        })

        const colorGroup = {
          color: color.value,
          slice: colorSlice,
          objectIds: []
        }

        const processedObjectIdLevels = processObjectIdLevel(obj, host, matrixView)

        objectIds.push(processedObjectIdLevels.id)
        onSelectionPair(processedObjectIdLevels.id, processedObjectIdLevels.selectionId)
        if (processedObjectIdLevels.shouldSelect) selectedIds.push(processedObjectIdLevels.id)
        if (processedObjectIdLevels.shouldColor) {
          colorGroup.objectIds.push(processedObjectIdLevels.id)
        }
        objectTooltipData.set(processedObjectIdLevels.id, {
          selectionId: processedObjectIdLevels.selectionId,
          data: processedObjectIdLevels.data
        })

        if (colorGroup.objectIds.length > 0) colorByIds.push(colorGroup)
      })
    })
  } else {
    localMatrixView.forEach((obj) => {
      const processedObjectIdLevels = processObjectIdLevel(obj, host, matrixView)

      // Apply conditional formatting color if present, regardless of selection state
      if (processedObjectIdLevels.color) {
        let group = colorByIds.find((g) => g.color === processedObjectIdLevels.color)
        if (!group) {
          group = {
            color: processedObjectIdLevels.color,
            objectIds: []
          }
          colorByIds.push(group)
        }
        // Always add to color group if color is specified (conditional formatting)
        group.objectIds.push(processedObjectIdLevels.id)
      } else if (processedObjectIdLevels.shouldColor) {
        // Only use shouldColor flag when there's no conditional formatting
        // This preserves the original cross-filter coloring behavior
      }

      objectIds.push(processedObjectIdLevels.id)
      onSelectionPair(processedObjectIdLevels.id, processedObjectIdLevels.selectionId)
      if (processedObjectIdLevels.shouldSelect) {
        selectedIds.push(processedObjectIdLevels.id)
      }
      objectTooltipData.set(processedObjectIdLevels.id, {
        selectionId: processedObjectIdLevels.selectionId,
        data: processedObjectIdLevels.data
      })
    })
  }

  // if (hasColorFilter) {
  //   const start = performance.now()
  //   console.log('Sorting the colors started...')
  //   // powerbi sorts the objects alphabetically for color legends
  //   const sortedMatrix = localMatrixView.sort((a, b) => {
  //     return (a.levelValues[0].value as string).localeCompare(b.levelValues[0].value as string)
  //   })
  //   const end = performance.now()
  //   console.log(`Sorted in: ${(end - start) / 1000} s`)

  //   sortedMatrix.forEach((obj) => {
  //     if (previousPalette) host.colorPalette['colorPalette'] = previousPalette

  //     const colorSelectionId = host
  //       .createSelectionIdBuilder()
  //       .withMatrixNode(obj, matrixView.rows.levels)
  //       .createSelectionId()

  //     const value = obj.levelValues[0].value as string
  //     const color = host.colorPalette.getColor(value)
  //     const colorSlice = new fs.ColorPicker({
  //       name: 'selectorFill',
  //       displayName: value,
  //       value: {
  //         value: color.value
  //       },
  //       selector: colorSelectionId.getSelector()
  //     })

  //     const colorGroup = {
  //       color: color.value,
  //       slice: colorSlice,
  //       objectIds: []
  //     }

  //     const processedObjectIdLevels = processObjectIdLevel(obj, host, matrixView)

  //     objectIds.push(processedObjectIdLevels.id)
  //     onSelectionPair(processedObjectIdLevels.id, processedObjectIdLevels.selectionId)
  //     if (processedObjectIdLevels.shouldSelect) selectedIds.push(processedObjectIdLevels.id)
  //     if (processedObjectIdLevels.shouldColor) {
  //       colorGroup.objectIds.push(processedObjectIdLevels.id)
  //     }
  //     objectTooltipData.set(processedObjectIdLevels.id, {
  //       selectionId: processedObjectIdLevels.selectionId,
  //       data: processedObjectIdLevels.data
  //     })

  //     if (colorGroup.objectIds.length > 0) colorByIds.push(colorGroup)
  //   })
  // }

  previousPalette = host.colorPalette['colorPalette']

  return {
    modelObjects: internalizedModelObjects || modelObjects, // Use internalized data if available
    objectIds,
    selectedIds,
    colorByIds: colorByIds.length > 0 ? colorByIds : null,
    objectTooltipData,
    isFromStore: !!internalizedModelObjects // true if loaded from internalized data
  }
}
