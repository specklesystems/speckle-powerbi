import powerbi from 'powerbi-visuals-api'
import { IViewerTooltip, IViewerTooltipData, SpeckleDataInput } from '../types'
import { formattingSettings as fs } from 'powerbi-visuals-utils-formattingmodel'
import {
  createDataViewWildcardSelector,
  DataViewWildcardMatchingOption
} from 'powerbi-visuals-utils-dataviewutils/lib/dataViewWildcard'
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions
import { SpeckleVisualSettingsModel } from 'src/settings/visualSettingsModel'

export function validateMatrixView(options: VisualUpdateOptions): {
  hasColorFilter: boolean
  view: powerbi.DataViewMatrix
} {
  const matrixVew = options.dataViews[0].matrix
  if (!matrixVew) throw new Error('Data does not contain a matrix data view')

  let hasStream = false,
    hasParentObject = false,
    hasObject = false,
    hasColorFilter = false

  matrixVew.rows.levels.forEach((level) => {
    level.sources.forEach((source) => {
      if (!hasStream) hasStream = source.roles['stream'] != undefined
      if (!hasParentObject) hasParentObject = source.roles['parentObject'] != undefined
      if (!hasObject) hasObject = source.roles['object'] != undefined
      if (!hasColorFilter) hasColorFilter = source.roles['objectColorBy'] != undefined
    })
  })

  if (!hasStream) throw new Error('Missing Stream ID input')
  if (!hasParentObject) throw new Error('Missing Commit Object ID input')
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
  const objectUrlsToLoad = [],
    objectIds = [],
    selectedIds = [],
    colorByIds = [],
    objectTooltipData = new Map<string, IViewerTooltip>()

  matrixView.rows.root.children.forEach((streamUrlChild) => {
    const url = streamUrlChild.value

    streamUrlChild.children?.forEach((parentObjectIdChild) => {
      const parentId = parentObjectIdChild.value
      objectUrlsToLoad.push(`${url}/objects/${parentId}`)

      if (!hasColorFilter) {
        processObjectIdLevel(parentObjectIdChild, host, matrixView).forEach((objRes) => {
          objectIds.push(objRes.id)
          onSelectionPair(objRes.id, objRes.selectionId)
          if (objRes.shouldSelect) selectedIds.push(objRes.id)
          if (objRes.color) {
            let group = colorByIds.find((g) => g.color === objRes.color)
            if (!group) {
              group = {
                color: objRes.color,
                objectIds: []
              }
              colorByIds.push(group)
            }
            group.objectIds.push(objRes.id)
          }
          objectTooltipData.set(objRes.id, {
            selectionId: objRes.selectionId,
            data: objRes.data
          })
        })
      } else {
        if (previousPalette) host.colorPalette['colorPalette'] = previousPalette
        parentObjectIdChild.children?.forEach((colorByChild) => {
          const colorSelectionId = host
            .createSelectionIdBuilder()
            .withMatrixNode(colorByChild, matrixView.rows.levels)
            .createSelectionId()

          const color = host.colorPalette.getColor(colorByChild.value as string)
          if (colorByChild.objects) {
            console.log(
              '⚠️COLOR NODE HAS objects',
              colorByChild.objects,
              colorByChild.objects.color?.fill
            )
          }

          const colorSlice = new fs.ColorPicker({
            name: 'selectorFill',
            displayName: colorByChild.value.toString(),
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

          processObjectIdLevel(colorByChild, host, matrixView).forEach((objRes) => {
            objectIds.push(objRes.id)
            onSelectionPair(objRes.id, objRes.selectionId)
            if (objRes.shouldSelect) selectedIds.push(objRes.id)
            if (objRes.shouldColor) {
              colorGroup.objectIds.push(objRes.id)
            }
            objectTooltipData.set(objRes.id, {
              selectionId: objRes.selectionId,
              data: objRes.data
            })
          })
          if (colorGroup.objectIds.length > 0) colorByIds.push(colorGroup)
        })
      }
    })
  })

  previousPalette = host.colorPalette['colorPalette']

  return {
    objectsToLoad: objectUrlsToLoad,
    objectIds,
    selectedIds,
    colorByIds: colorByIds.length > 0 ? colorByIds : null,
    objectTooltipData,
    view: matrixView
  }
}
