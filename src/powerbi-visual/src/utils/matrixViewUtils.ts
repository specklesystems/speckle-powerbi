import powerbi from 'powerbi-visuals-api'
import { IViewerTooltip, IViewerTooltipData, SpeckleDataInput } from '../types'
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions
import { FieldInputState, useVisualStore } from '@src/store/visualStore'
import { getSlugFromHostAppNameAndVersion } from './hostAppSlug'
import { useUpdateConnector } from '@src/composables/useUpdateConnector'
import { decodeModelInfos, DecodedModelInfo } from './decodeUserInfo'

export class AsyncPause {
  private lastPauseTime = 0
  public needsWait = false

  public tick(maxDelta: number) {
    const now = performance.now()
    const delta = now - this.lastPauseTime
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
  const matrixVew = options.dataViews.find((dv) => dv.matrix !== undefined)?.matrix

  let hasModelInfo = false,
    hasApplicationIds = false,
    hasColorFilter = false,
    hasTooltipData = false

  // Models[Model Info] arrives as the first/top-level matrix rows grouping;
  // the single-value dataview probe and the in-matrix measure check stay as
  // legacy fallbacks
  hasModelInfo = options.dataViews.some((dv) => dv.single !== undefined)

  // no `values` binding is guaranteed any more (tooltipData is optional), so
  // valueSources/columns can be absent on a perfectly valid minimal binding
  ;(matrixVew.valueSources || []).forEach((level) => {
    if (!hasModelInfo) hasModelInfo = level.roles['modelInfo'] != undefined
  })

  matrixVew.rows.levels.forEach((level) => {
    level.sources.forEach((source) => {
      if (!hasModelInfo) hasModelInfo = source.roles['modelInfo'] != undefined
      if (!hasApplicationIds) hasApplicationIds = source.roles['applicationIds'] != undefined
      if (!hasColorFilter) hasColorFilter = source.roles['colorBy'] != undefined
    })
  })

  ;(matrixVew.columns?.levels || []).forEach((level) => {
    level.sources.forEach((source) => {
      if (!hasTooltipData) hasTooltipData = source.roles['tooltipData'] != undefined
    })
  })

  return {
    modelInfo: hasModelInfo,
    applicationIds: hasApplicationIds,
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
      // skip the Model Info measure by ROLE (legacy in-matrix binding); the slim
      // dataview has no such value cell, so a blind slice(1) would eat the first
      // real tooltip field
      if (colInfo?.roles?.['modelInfo']) return
      const propData: IViewerTooltipData = {
        displayName: colInfo.displayName.replace('First ', ''),
        value: value.value === null ? '<not set>' : value.value.toString()
      }
      objectData.push(propData)
    })
  return {
    data: objectData,
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
  // object_key mode delivers numbers — identity keys are strings everywhere downstream
  const objId = String(objectIdChild.value)
  // Create selection IDs for each object
  const nodeSelection = host
    .createSelectionIdBuilder()
    .withMatrixNode(objectIdChild, matrixView.rows.levels)
    .createSelectionId()
  // Create value records for the tooltips
  const objectValues = processObjectValues(objectIdChild, matrixView)
  const res = { id: objId, selectionId: nodeSelection, color: undefined, ...objectValues }
  // Conditional-formatting color override, if any
  if (objectIdChild.objects) {
    //@ts-ignore
    const color = objectIdChild.objects.color?.fill?.solid?.color as string
    if (color) {
      res.color = color
    }
  }
  return res
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
 * Parses the matrix dataView into a SpeckleDataInput. Pure parsing — no
 * downloading happens here; the store triggers the viewer load when the
 * versionKey changes.
 */
export async function processMatrixView(
  matrixView: powerbi.DataViewMatrix,
  host: powerbi.extensibility.visual.IVisualHost,
  hasColorFilter: boolean,
  onSelectionPair: (objId: string, selectionId: powerbi.extensibility.ISelectionId) => void,
  /**
   * Ids-only fast path for big FILTERED row sets: skips the per-row SelectionId
   * builder and tooltip extraction (the main-thread freeze at 456k rows — the
   * builder alone is ~0.1ms/row). Filter mode has no highlights to inspect, and
   * click-select/tooltips over a huge isolation are a fair trade for a live UI.
   */
  lightweight = false,
  /** Model Info from the slim single-value dataview (dormant legacy plumbing;
   *  see 0464a5c) — consulted only when the blob is not bound as the top-level
   *  rows grouping. Null = legacy report with the blob bound into the matrix. */
  modelInfoBlob: string | null = null
): Promise<SpeckleDataInput> {
  const visualStore = useVisualStore()
  const objectIds = [],
    selectedIds = [],
    colorByIds = [],
    objectTooltipData = new Map<string, IViewerTooltip>()

  let localMatrixView = matrixView.rows.root.children

  // Safety check for matrix data structure
  if (!localMatrixView || localMatrixView.length === 0) {
    throw new Error('Matrix view has no data rows')
  }

  // Models[Model Info] as the FIRST rows grouping: the blob is the parent
  // node's own value — one copy per update/segment instead of one per row.
  // Object traversal (colorBy groups or leaves) starts below that node.
  const modelInfoIsFirstLevel = matrixView.rows.levels[0]?.sources?.some(
    (source) => source.roles?.['modelInfo'] != undefined
  )

  let encodedBlob: string
  if (modelInfoIsFirstLevel) {
    // the connector's Models table is one row by contract; several distinct
    // grouping values would silently render every model's objects against the
    // FIRST payload only (Models is disconnected, so the matrix cross-joins)
    if (localMatrixView.length !== 1) {
      throw new Error(
        `The Models table must contain exactly one Model Info row (found ${localMatrixView.length}). Load Models from a single Speckle.GetTables call.`
      )
    }
    const blobValue = localMatrixView[0].value
    if (typeof blobValue !== 'string' || blobValue.length === 0) {
      // a blank grouping node must read as a binding problem, not as a
      // String(null) blob that decodeModelInfos rejects as corrupt data
      throw new Error(
        'The Model Info grouping is empty — bind Models[Model Info] from the Speckle connector'
      )
    }
    encodedBlob = blobValue
    // alias the single grouping node's children (zero-copy) — no spread here:
    // spreading 150k+ children as call arguments overflows V8's argument limit
    localMatrixView = localMatrixView[0].children ?? []
    if (localMatrixView.length === 0) {
      throw new Error('Matrix view has no object rows below the Model Info grouping')
    }
  } else if (modelInfoBlob) {
    encodedBlob = modelInfoBlob
  } else {
    // legacy: the "Model Info" measure cell carries the blob on every row
    try {
      if (hasColorFilter) {
        encodedBlob = localMatrixView[0].children[0].values[0].value as unknown as string
      } else {
        encodedBlob = localMatrixView[0].values[0].value as unknown as string
      }
    } catch (error) {
      throw new Error(`Failed to extract Model Info from matrix: ${error.message}`)
    }
  }

  // decode ONCE per update
  let modelInfos: DecodedModelInfo[]
  try {
    modelInfos = decodeModelInfos(encodedBlob)
  } catch (error) {
    visualStore.setCommonError(
      error instanceof Error
        ? error.message
        : 'Failed to decode model info from the data connector. Please refresh the data.'
    )
    visualStore.setViewerReadyToLoad(false)
    return {
      modelInfos: [],
      versionKey: '',
      hasLegacyModels: false,
      objectIds: [],
      selectedIds: [],
      colorByIds: null,
      objectTooltipData: new Map(),
      hasActiveFilters: false,
      universeComplete: false
    }
  }

  const versionKey = modelInfos.map((info) => info.versionId).join(',')
  const hasLegacyModels = modelInfos.some((info) => info.pipeline === 'legacy')

  // refresh credentials/branding + schedule a viewer reload when the loaded
  // versions changed
  if (visualStore.lastLoadedVersionKey !== versionKey) {
    const primary = modelInfos[0]
    visualStore.setReceiveInfo({
      userEmail: primary.email,
      serverUrl: primary.server,
      sourceApplication: getSlugFromHostAppNameAndVersion(primary.sourceApplication || ''),
      workspaceId: primary.workspaceId || undefined,
      workspaceName: primary.workspaceName || undefined,
      workspaceLogo: primary.workspaceLogo || undefined,
      version: primary.version,
      canHideBranding: primary.canHideBranding || false,
      token: primary.token,
      projectId: primary.projectId
    })

    visualStore.setViewerReadyToLoad(true)
    visualStore.setViewerReloadNeeded()
    visualStore.setLoadingProgress('Loading model', null)
  }

  if (visualStore.receiveInfo && visualStore.receiveInfo.version) {
    const { checkUpdate } = useUpdateConnector()
    await checkUpdate()
  }

  // If colors assigned, data arrives nested
  if (hasColorFilter) {
    if (previousPalette) host.colorPalette['colorPalette'] = previousPalette

    localMatrixView.forEach((colorObjects) => {
      const value = colorObjects.value as string
      const color = host.colorPalette.getColor(value)

      if (lightweight) {
        // ids only: every child belongs to this color group (no highlights in
        // filter mode), no selection ids, no tooltips
        const colorGroup = { color: color.value, objectIds: [] }
        colorObjects.children.forEach((obj) => {
          const id = String(obj.value)
          objectIds.push(id)
          colorGroup.objectIds.push(id)
        })
        if (colorGroup.objectIds.length > 0) colorByIds.push(colorGroup)
        return
      }

      colorObjects.children.forEach((obj) => {
        const colorGroup = {
          color: color.value,
          objectIds: []
        }

        const processed = processObjectNode(obj, host, matrixView)

        objectIds.push(processed.id)
        onSelectionPair(processed.id, processed.selectionId)
        if (processed.shouldSelect) selectedIds.push(processed.id)
        if (processed.shouldColor) {
          colorGroup.objectIds.push(processed.id)
        }
        objectTooltipData.set(processed.id, {
          selectionId: processed.selectionId,
          data: processed.data
        })

        if (colorGroup.objectIds.length > 0) colorByIds.push(colorGroup)
      })
    })
  } else if (lightweight) {
    localMatrixView.forEach((obj) => {
      objectIds.push(String(obj.value))
    })
  } else {
    localMatrixView.forEach((obj) => {
      const processed = processObjectNode(obj, host, matrixView)

      // Apply conditional formatting color if present, regardless of selection state
      if (processed.color) {
        let group = colorByIds.find((g) => g.color === processed.color)
        if (!group) {
          group = {
            color: processed.color,
            objectIds: []
          }
          colorByIds.push(group)
        }
        group.objectIds.push(processed.id)
      }

      objectIds.push(processed.id)
      onSelectionPair(processed.id, processed.selectionId)
      if (processed.shouldSelect) {
        selectedIds.push(processed.id)
      }
      objectTooltipData.set(processed.id, {
        selectionId: processed.selectionId,
        data: processed.data
      })
    })
  }

  previousPalette = host.colorPalette['colorPalette']

  return {
    modelInfos,
    versionKey,
    hasLegacyModels,
    objectIds,
    selectedIds,
    colorByIds: colorByIds.length > 0 ? colorByIds : null,
    objectTooltipData,
    // overwritten by the caller from options.jsonFilters (not visible here)
    hasActiveFilters: false,
      universeComplete: false
  }
}
