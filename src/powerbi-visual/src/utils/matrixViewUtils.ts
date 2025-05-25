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
      res.shouldColor = true
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
}

async function getReceiveInfo(id) {
  try {
    const ids = (id as string).split(',')
    const response = await fetch(`http://localhost:29364/user-info/${ids[0]}`)
    if (!response.body) {
      console.error('No response body')
      return
    }

    return await response.json()
  } catch (error) {
    console.log(error)
    console.log("User infp couldn't retrieved from local server.")
  }
}

async function fetchStreamedData(commaSeparatedModelIds: string) {
  const modelIds = (commaSeparatedModelIds as string).split(',')
  const modelObjects = []

  for await (const id of modelIds) {
    const objects = await fetchStreamedDataForModel(id)
    modelObjects.push(objects)
  }
  return modelObjects
}

async function fetchStreamedDataForModel(id) {
  try {
    const response = await fetch(`http://localhost:29364/get-objects/${id}`)

    if (!response.body) {
      console.error('No response body')
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const objects = []
    let buffer = ''

    const start = performance.now()
    console.log('Streaming started...')
    for await (const chunk of readStream(reader)) {
      // chucks.push(chuck)
      buffer += decoder.decode(chunk, { stream: true })

      let boundary
      while ((boundary = buffer.indexOf('\n')) !== -1) {
        const jsonString = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 1)

        try {
          const obj = JSON.parse(jsonString)
          objects.push(obj)

          // console.log('Received object:', jsonObject)
        } catch (e) {
          console.error('Invalid JSON chunk:', jsonString)
        }
      }
    }
    try {
      const obj = JSON.parse(buffer)
      objects.push(obj)
      // console.log('Received object:', jsonObject)
    } catch (e) {
      console.error('Invalid JSON chunk:', buffer)
    }

    const end = performance.now()
    console.log(`Objects streamed in: ${(end - start) / 1000} s`)

    const startObjectCleanup = performance.now()
    // Skips first element
    for (let i = 1; i < objects.length; i++) {
      const obj = objects[i]
      if (obj.speckle_type) {
        if (obj.speckle_type.includes('Objects.Data.DataObject')) {
          delete obj.properties
        }
      }
      delete obj.__closure
    }
    const endObjectCleanup = performance.now()
    console.log(`Objects cleaned up in: ${(endObjectCleanup - startObjectCleanup) / 1000} s`)

    const sizeInBytes = new TextEncoder().encode(JSON.stringify(objects)).length
    const sizeInMB = sizeInBytes / (1024 * 1024)
    console.log(`Size of objects: ${sizeInMB} MB`)

    return objects
  } catch (error) {
    console.log(error)
    console.log("Objects couldn't retrieved from local server.")
  } finally {
    console.log('Streaming finished!')
  }
}

async function* readStream(reader) {
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    yield value
  }
}

export async function processMatrixView(
  matrixView: powerbi.DataViewMatrix,
  host: powerbi.extensibility.visual.IVisualHost,
  hasColorFilter: boolean,
  settings: SpeckleVisualSettingsModel,
  onSelectionPair: (objId: string, selectionId: powerbi.extensibility.ISelectionId) => void
): Promise<SpeckleDataInput> {
  const visualStore = useVisualStore()
  const objectIds = [],
    selectedIds = [],
    colorByIds = [],
    objectTooltipData = new Map<string, IViewerTooltip>()

  console.log('🪜 Processing Matrix View', matrixView)

  const localMatrixView = matrixView.rows.root.children
  let id = null

  if (hasColorFilter) {
    id = localMatrixView[0].children[0].values[0].value as unknown as string
  } else {
    id = localMatrixView[0].values[0].value as unknown as string
  }

  // const id = localMatrixView[0].values[0].value as unknown as string
  console.log('🗝️ Root Object Id: ', id)
  console.log('Last laoded root object id', visualStore.lastLoadedRootObjectId)

  let modelObjects: object[][] = undefined

  if (visualStore.isLoadingFromFile) {
    console.log('The data is loading from file, skipping the streaming it.')
  }

  if (visualStore.lastLoadedRootObjectId !== id && !visualStore.isLoadingFromFile) {
    const start = performance.now()
    visualStore.setViewerReadyToLoad()
    visualStore.setLoadingProgress('Loading', null)

    // stream data
    modelObjects = await fetchStreamedData(id)

    const receiveInfo = await getReceiveInfo(id)
    if (receiveInfo) {
      visualStore.setReceiveInfo({
        userEmail: receiveInfo.email,
        serverUrl: receiveInfo.server,
        sourceApplication: getSlugFromHostAppNameAndVersion(receiveInfo.sourceApplication)
      })
    }

    visualStore.setViewerReloadNeeded() // they should be marked as deferred action bc of update function complexity.

    console.log(`🚀 Upload is completed in ${(performance.now() - start) / 1000} s!`)
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
    modelObjects,
    objectIds,
    selectedIds,
    colorByIds: colorByIds.length > 0 ? colorByIds : null,
    objectTooltipData,
    isFromStore: false
  }
}
