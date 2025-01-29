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

  let objects: object[] = undefined
  if (visualStore.lastLoadedRootObjectId !== id) {
    try {
      const res = await fetch(`http://localhost:49161/get-data/${id}`)
      objects = await res.json()
      visualStore.setViewerReloadNeeded() // they should be marked as deferred action bc of update function complexity.
    } catch (error) {
      // TODO: global toast notification to throw message for local server (manager)
      console.log("Objects couldn't retrieved from local server.")
    }
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
