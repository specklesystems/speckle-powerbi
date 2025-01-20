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

  let hasViewerData = false,
    hasObjectIds = false,
    hasColorFilter = false,
    hasTooltipData = false

  matrixVew.rows.levels.forEach((level) => {
    level.sources.forEach((source) => {
      if (!hasViewerData) hasViewerData = source.roles['viewerData'] != undefined
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
    viewerData: hasViewerData,
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
  const visualStore = useVisualStore()
  const objectIds = [],
    selectedIds = [],
    colorByIds = [],
    objectTooltipData = new Map<string, IViewerTooltip>()

  console.log('🪜 Processing Matrix View', matrixView)

  const objects: Record<string, string[]> = {}

  let objectsString = ''

  // NOTE: matrix view gave us already filtered out rows from tooltip data if it is assigned
  matrixView.rows.root.children.forEach((obj) => {
    // otherwise there is no point to collect objects
    if (visualStore.viewerReloadNeeded) {
      const id = obj.children[0].value as unknown as string
      const viewerDataValue = obj.value as unknown as string
      if (!viewerDataValue.startsWith('z_')) {
        objectsString += viewerDataValue.slice(9)
      }

      // before row optimization
      // const value = (obj.value as unknown as string).slice(9)
      // const existingObjectId = Object.keys(objects).find((k) => id.includes(k))
      // if (!existingObjectId) {
      //   objects[id] = [value]
      // } else {
      //   objects[existingObjectId].push(value)
      // }
    }

    const processedObjectIdLevels = processObjectIdLevel(obj, host, matrixView)

    processedObjectIdLevels.forEach((objRes) => {
      objectIds.push(objRes.id)
      onSelectionPair(objRes.id, objRes.selectionId)
      if (objRes.shouldSelect) {
        selectedIds.push(objRes.id)
      }
      objectTooltipData.set(objRes.id, {
        selectionId: objRes.selectionId,
        data: objRes.data
      })
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

        processObjectIdLevel(child, host, matrixView).forEach((objRes) => {
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
  const jsonObjects: object[] = []
  try {
    // otherwise there is no point to join collected objects
    if (visualStore.viewerReloadNeeded) {
      // for (const objs of Object.values(objects)) {
      //   jsonObjects.push(JSON.parse(objs.join('')))
      // }
      jsonObjects.push(JSON.parse(objectsString))
    }
  } catch (error) {
    console.error(error)
  }

  previousPalette = host.colorPalette['colorPalette']

  return {
    objects: jsonObjects,
    objectIds,
    selectedIds,
    colorByIds: colorByIds.length > 0 ? colorByIds : null,
    objectTooltipData,
    view: matrixView,
    isFromStore: false
  }
}
