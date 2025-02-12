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

  matrixVew.rows.levels.forEach((level) => {
    level.sources.forEach((source) => {
      if (!hasRootObjectId) hasRootObjectId = source.roles['rootObjectId'] != undefined
      if (!hasObjectIds) hasObjectIds = source.roles['objectIds'] != undefined
      if (!hasColorFilter) hasColorFilter = source.roles['objectColorBy'] != undefined
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
        displayName: colInfo.displayName,
        value: value.value.toString()
      }
      objectData.push(propData)
    })
  return { data: objectData, shouldColor, shouldSelect }
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

export type UserInfo = {
  userEmail: string
  serverUrl: string
}

function chunkArray(array: string[], size: number) {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
    array.slice(i * size, i * size + size)
  )
}

async function fetchDataInBatches(id, batchSize = 10) {
  try {
    const visualStore = useVisualStore()
    // Fetch the root object
    const rootResponse = await fetch(`http://localhost:49161/get-object/${id}`)
    if (!rootResponse.ok) throw new Error(`HTTP error! Status: ${rootResponse.status}`)

    const rootObject = await rootResponse.json()

    if (!rootObject.__closure) throw new Error('Missing `__closure` in root object')

    visualStore.setLoadingProgress('Loading', 0)

    const childIds = Object.keys(rootObject.__closure)
    const childrenObjects = []

    const batches = chunkArray(childIds, batchSize)
    let count = 0
    let progress = 0

    const pause = new AsyncPause()

    for (const batch of batches) {
      count++
      // console.log(`Fetching batch: ${batch.join(', ')}`)

      const batchPromises = batch.map(async (childId) => {
        pause.tick(100)
        if (pause.needsWait) {
          await pause.wait(50)
        }
        const response = await fetch(`http://localhost:49161/get-object/${childId}`)

        if (!response.ok) {
          console.warn(`Failed to fetch child ${childId}, skipping...`)
          return null
        }

        return response.json()
      })

      const results = await Promise.all(batchPromises)
      const newProgress = parseFloat((count / batches.length).toFixed(2))
      if (newProgress !== progress) {
        visualStore.setLoadingProgress('Loading', newProgress)
        progress = newProgress
      }

      childrenObjects.push(...results)
    }

    visualStore.setLoadingProgress('Loading', 1)

    return [rootObject, ...childrenObjects]
  } catch (error) {
    console.error('Error fetching data:', error)
  }
}

async function fetchOneByOne(id: string) {
  try {
    const rootResponse = await fetch(`http://localhost:49161/get-object/${id}`)
    const rootObject = await rootResponse.json()
    if (!rootResponse.ok) {
      throw new Error(`HTTP error! Status: ${rootResponse.status} for root object ${id}`)
    }
    let loadedObject = 1
    const childIds = Object.keys(rootObject.__closure)
    const totalObjectCount = childIds.length + 1
    console.log(`Total object count: ${totalObjectCount}`)

    const childrenObjects = []
    for (const childId of childIds) {
      // console.log(`Fetching child: ${childId}`)
      const response = await fetch(`http://localhost:49161/get-object/${childId}`)
      loadedObject++
      if (!response.ok) {
        console.warn(`Failed to fetch child ${childId}, skipping...`)
        continue
      }
      const childObject = await response.json()
      childrenObjects.push(childObject)
    }
    return [rootObject, ...childrenObjects]
  } catch (error) {
    console.log(error)
    console.log("Objects couldn't retrieved from local server.")
  }
}

async function getTotalChildrenCount(id: string) {
  const rootResponse = await fetch(`http://localhost:49161/get-object/${id}`)
  if (!rootResponse.ok) throw new Error(`HTTP error! Status: ${rootResponse.status}`)

  const rootObject = await rootResponse.json()

  if (!rootObject.__closure) throw new Error('Missing `__closure` in root object')

  return Object.keys(rootObject.__closure).length
}

async function fetchStreamedData(id) {
  try {
    const response = await fetch(`http://localhost:49161/get-objects/${id}`)

    if (!response.body) {
      console.error('No response body')
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    console.log('Streaming started...')
    for await (const chunk of readStream(reader)) {
      buffer += decoder.decode(chunk, { stream: true })
    }
    return JSON.parse(buffer)
  } catch (error) {
    console.log(error)
    console.log("Objects couldn't retrieved from local server.")
  } finally {
    console.log('Streaming finished!')
  }
}

async function fetchStreamedData2(id) {
  const visualStore = useVisualStore()
  try {
    const totalObjectCount = (await getTotalChildrenCount(id)) + 1
    const response = await fetch(`http://localhost:49161/get-objects/${id}`)

    if (!response.body) {
      console.error('No response body')
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let objects = []
    const count = 0
    const progress = 0

    console.log('Streaming started...')

    for await (const chunk of readStream(reader)) {
      buffer += decoder.decode(chunk, { stream: true })

      // try {
      //   const parsed = JSON.parse(buffer)
      //   count++
      //   if (Array.isArray(parsed)) {
      //     objects = parsed
      //   } else {
      //     objects.push(parsed)
      //   }
      //   buffer = ''
      //   const newProgress = parseFloat((count / totalObjectCount).toFixed(2))
      //   if (newProgress !== progress) {
      //     visualStore.setLoadingProgress('Loading', newProgress)
      //     progress = newProgress
      //   }
      // } catch (err) {
      //   console.log(err)
      // }
    }
    const parsed = JSON.parse(buffer)
    objects = parsed
    console.log('Streaming finished!')
    return objects
  } catch (error) {
    console.log(error)
    console.log("Objects couldn't retrieved from local server.")
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

  const localMatrixView = matrixView.rows.root.children[0]
  const id = localMatrixView.value as unknown as string
  console.log('🗝️ Root Object Id: ', id)
  console.log('Last laoded root object id', visualStore.lastLoadedRootObjectId)

  type Data = {
    userInfo: UserInfo
    objects: object[]
  }

  let objects: object[] = undefined
  if (visualStore.lastLoadedRootObjectId !== id) {
    const start = performance.now()
    visualStore.setViewerReadyToLoad()

    // old way

    // try {
    //   const res = await fetch(`http://localhost:49161/get-data/${id}`)
    //   const data = (await res.json()) as unknown as Data
    //   objects = data.objects
    //   visualStore.setUserInfo(data.userInfo)
    //   visualStore.setViewerReloadNeeded() // they should be marked as deferred action bc of update function complexity.
    // } catch (error) {
    //   // TODO: global toast notification to throw message for local server (manager)
    //   console.log("Objects couldn't retrieved from local server.")
    // }

    // stream data 1
    // objects = await fetchOneByOne(id)

    // stream data 2 - batched
    // objects = await fetchDataInBatches(id, 100)

    // stream data 3
    objects = await fetchStreamedData(id)

    // visualStore.setUserInfo(data.userInfo) // TODO: figure it out user details
    visualStore.setViewerReloadNeeded() // they should be marked as deferred action bc of update function complexity.

    console.log(`🚀 Upload is completed in ${(performance.now() - start) / 1000} s!`)
  }

  // NOTE: matrix view gave us already filtered out rows from tooltip data if it is assigned
  localMatrixView.children?.forEach((obj) => {
    // otherwise there is no point to collect objects
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

    if (hasColorFilter) {
      obj.children.forEach((child) => {
        const colorSelectionId = host
          .createSelectionIdBuilder()
          .withMatrixNode(child, matrixView.rows.levels)
          .createSelectionId()

        const color = host.colorPalette.getColor(child.value as string)

        const colorSlice = new fs.ColorPicker({
          name: 'selectorFill',
          displayName: child.value?.toString(),
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

        const processedObjectIdLevels = processObjectIdLevel(child, host, matrixView)

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
    }
  })

  previousPalette = host.colorPalette['colorPalette']

  return {
    objects,
    objectIds,
    selectedIds,
    colorByIds: colorByIds.length > 0 ? colorByIds : null,
    objectTooltipData,
    view: matrixView,
    isFromStore: false
  }
}
