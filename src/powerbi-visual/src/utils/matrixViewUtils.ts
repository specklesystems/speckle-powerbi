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
import { decodeUserInfoSafe, DecodedUserInfo } from './decodeUserInfo'

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

/**
 * Extracts userInfoData from encoded string
 * Returns array of DecodedUserInfo for federated models, single item for single models
 */
function decodeUserInfoFromId(encodedId: string): DecodedUserInfo[] {
  try {
    return decodeUserInfoSafe(encodedId)
  } catch (error) {
    console.error('Failed to decode user info from encoded ID:', error)
    throw new Error(`Invalid encoded user info data: ${error.message}`)
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
        // Need to decode id first to get actual root object IDs for comparison
        try {
          const decodedForCheck = decodeUserInfoFromId(id)
          const actualRootIds = decodedForCheck.map((info) => info.rootObjectId).join(',')
          const internalizedRootId = (internalizedModelObjects[0][0] as any).id

          if (internalizedRootId !== actualRootIds.split(',')[0]) {
            console.log(
              `📁 Internalized data mismatch: stored=${internalizedRootId}, current=${actualRootIds}. Using fresh data.`
            )
            internalizedModelObjects = undefined // Clear internalized data - use fresh data instead
          } else {
            console.log(
              '📁 Successfully validated internalized data matches current matrix:',
              internalizedModelObjects.length,
              'models'
            )
          }
        } catch (error) {
          console.error('📁 Failed to decode ID for internalized data check:', error)
          internalizedModelObjects = undefined
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
        // Need to decode to get actual root object ID for comparison
        try {
          const decodedForReload = decodeUserInfoFromId(id)
          const actualRootIds = decodedForReload.map((info) => info.rootObjectId).join(',')

          const needsReload =
            !visualStore.isViewerObjectsLoaded ||
            visualStore.lastLoadedRootObjectId !== actualRootIds
          if (needsReload) {
            console.log('🔄 Forcing viewer reload for internalized data (model switch or first load)')
            visualStore.setViewerReloadNeeded()
            visualStore.setViewerReadyToLoad(true)
            visualStore.setLoadingProgress('📁 Loading from file', null)
          } else {
            console.log('📁 Internalized data already loaded, skipping reload')
          }
          visualStore.lastLoadedRootObjectId = actualRootIds // Set to actual root IDs to skip API calls
        } catch (error) {
          console.error('📁 Failed to decode ID for reload check:', error)
        }
      } else {
        console.error('📁 Failed to unzip internalized data')
      }
    } catch (error) {
      console.error('📁 Error processing internalized data:', error)
    }
  }

  // Extract the encoded string from matrix (id is now the base64 encoded userInfo)
  const encodedId = id
  console.log('🗝️ Encoded ID: ', encodedId.substring(0, 50) + '...')
  console.log('Last loaded root object id', visualStore.lastLoadedRootObjectId)

  let modelObjects: object[][] = undefined

  // Decode userInfo first to get actual root object IDs for comparison
  let decodedUserInfos: DecodedUserInfo[]
  let actualRootObjectIds: string

  try {
    decodedUserInfos = decodeUserInfoFromId(encodedId)
    // Build comma-separated list of actual root object IDs
    actualRootObjectIds = decodedUserInfos.map((info) => info.rootObjectId).join(',')
    console.log(`🔓 Decoded ${decodedUserInfos.length} userInfo(s) - Root IDs: ${actualRootObjectIds}`)
  } catch (error) {
    console.error('Failed to decode user info:', error)
    visualStore.setCommonError(
      'Failed to decode user info from data connector. Please refresh the data.'
    )
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

  // Check if we need to reload (compare actual root object IDs, not encoded strings)
  if (
    visualStore.lastLoadedRootObjectId !== actualRootObjectIds &&
    !visualStore.isLoadingFromFile &&
    !internalizedModelObjects
  ) {
    const start = performance.now()

    // Use the first decoded userInfo for visual store (for federated, all have same credentials)
    const primaryUserInfo = decodedUserInfos[0]

    visualStore.setReceiveInfo({
      userEmail: primaryUserInfo.email,
      serverUrl: primaryUserInfo.server,
      sourceApplication: getSlugFromHostAppNameAndVersion(primaryUserInfo.sourceApplication || ''),
      workspaceId: primaryUserInfo.workspaceId || undefined,
      workspaceName: primaryUserInfo.workspaceName || undefined,
      workspaceLogo: primaryUserInfo.workspaceLogo || undefined,
      version: primaryUserInfo.version,
      canHideBranding: primaryUserInfo.canHideBranding || false,
      token: primaryUserInfo.token,
      projectId: primaryUserInfo.projectId
    })
    console.log(`✅ Credentials loaded from encoded data`)

    // Get credentials for Speckle API download
    const token = primaryUserInfo.token
    const serverUrl = primaryUserInfo.server
    const projectId = primaryUserInfo.projectId

    if (!token || !serverUrl || !projectId) {
      visualStore.setCommonError(
        'Missing required credentials in encoded data. Please refresh the data from the data connector.'
      )
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
    console.log(`Server: ${serverUrl}, Project: ${projectId}, Objects: ${actualRootObjectIds}`)
    try {
      modelObjects = await fetchFromSpeckleApi(actualRootObjectIds, serverUrl, projectId, token)
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
