import powerbi from 'powerbi-visuals-api'
import { IViewerTooltip, IViewerTooltipData, SpeckleDataInput } from '../types'
import { formattingSettings as fs } from 'powerbi-visuals-utils-formattingmodel'
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions
import { SpeckleVisualSettingsModel } from 'src/settings/visualSettingsModel'

export function validateMatrixView(options: VisualUpdateOptions): {
  hasColorFilter: boolean
  view: powerbi.DataViewMatrix
} {
  const matrixVew = options.dataViews[0].matrix
  if (!matrixVew) throw new Error('Data does not contain a matrix data view')

  let hasObject = false,
    hasColorFilter = false

  matrixVew.rows.levels.forEach((level) => {
    level.sources.forEach((source) => {
      if (!hasObject) hasObject = source.roles['object'] != undefined
      if (!hasColorFilter) hasColorFilter = source.roles['objectColorBy'] != undefined
    })
  })

  if (!hasObject) throw new Error('Missing Object Id input')

  return {
    hasColorFilter,
    view: matrixVew
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
      if (value.valueSourceIndex) objectData.push(propData)
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
  return parentObjectIdChild.children?.map((objectIdChild) =>
    processObjectNode(objectIdChild, host, matrixView)
  )
}

export let previousPalette = null

export function resetPalette() {
  previousPalette = null
}
export function processMatrixView(
  matrixView: powerbi.DataViewMatrix,
  host: powerbi.extensibility.visual.IVisualHost,
  hasColorFilter: boolean,
  settings: SpeckleVisualSettingsModel,
  onSelectionPair: (objId: string, selectionId: powerbi.extensibility.ISelectionId) => void
): SpeckleDataInput {
  const objectJsonToLoad = [],
    objectIds = [],
    selectedIds = [],
    colorByIds = [],
    objectTooltipData = new Map<string, IViewerTooltip>()

  // Assume this has color filter
  matrixView.rows.root.children.forEach((colorByGroup) => {
    const colorByValue = colorByGroup.value
    console.log('Color by group', colorByValue, colorByGroup)

    const colorGroup = createColorGroup(host, colorByGroup, matrixView)

    colorByGroup.children.forEach((objectIdGroup) => {
      const uniqueId = objectIdGroup.value
      const jsonValue = objectIdGroup.values[0] // TODO: Json value is set as first value in capabilities.json

      objectJsonToLoad.push(JSON.parse(jsonValue.value.toString()))
      colorGroup.objectIds.push(uniqueId)

      if (jsonValue.highlight) console.log(uniqueId, jsonValue)
      var processedObject = processObjectNode(objectIdGroup, host, matrixView)
      console.log(processedObject)

      onSelectionPair(uniqueId.toString(), processedObject.selectionId)

      if (processedObject.shouldSelect) selectedIds.push(processedObject.id)
      if (processedObject.shouldColor) colorGroup.objectIds.push(processedObject.id)

      objectTooltipData.set(processedObject.id, {
        selectionId: processedObject.selectionId,
        data: processedObject.data
      })
    })

    if (colorGroup.objectIds.length > 0) colorByIds.push(colorGroup)
  })

  // TODO: Code behavior without color filter

  previousPalette = host.colorPalette['colorPalette']

  return {
    objectsToLoad: objectJsonToLoad,
    objectIds,
    selectedIds,
    colorByIds: colorByIds.length > 0 ? colorByIds : null,
    objectTooltipData,
    view: matrixView
  }
}
function createColorGroup(
  host: powerbi.extensibility.visual.IVisualHost,
  colorByGroup: powerbi.DataViewMatrixNode,
  matrixView: powerbi.DataViewMatrix
) {
  const colorSelectionId = host
    .createSelectionIdBuilder()
    .withMatrixNode(colorByGroup, matrixView.rows.levels)
    .createSelectionId()

  const color = host.colorPalette.getColor(colorByGroup.value as string)
  if (colorByGroup.objects) {
    console.log('⚠️COLOR NODE HAS objects', colorByGroup.objects, colorByGroup.objects.color?.fill)
  }

  const colorSlice = new fs.ColorPicker({
    name: 'selectorFill',
    displayName: colorByGroup.value.toString(),
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
  return colorGroup
}
