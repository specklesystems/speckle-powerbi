import { DecodedModelInfo } from '@src/utils/decodeUserInfo'
import { ColorByCategory } from '@src/utils/colorOverrides'
import { IdMode } from '@src/utils/objectIdentity'

/** Stable identity of the connected Color By column. */
export interface ColorByFieldIdentity {
  /** stable per-table/column key — the anchor for persisted color overrides */
  queryName: string
  /** current display name (Reset-all dialog, card copy) */
  displayName: string
}

export interface IViewerTooltipData {
  displayName: string
  value: string
}

export interface IViewerTooltip {
  selectionId: powerbi.extensibility.ISelectionId
  data: IViewerTooltipData[]
}

export interface SpeckleDataInput {
  /** one entry per model, decoded from the "Model Info" blob (v2) */
  modelInfos: DecodedModelInfo[]
  /** comma-joined versionIds — the reload key */
  versionKey: string
  /** true when at least one model came through the legacy (pre-4.0) pipeline */
  hasLegacyModels: boolean
  /**
   * Identity mode of the bound id column, resolved from column metadata (with
   * name/value fallbacks) at parse time. Carried with every processed input so
   * the viewer can switch modes on a same-version rebind. Null when
   * undecidable (no metadata, no recognizable name, no values).
   */
  idMode: IdMode | null
  /** bound identity values (Object Keys or Application IDs) of all data rows */
  objectIds: string[]
  selectedIds: string[]
  colorByIds: { objectIds: string[]; color: string }[] | null
  /** identity of the connected Color By column; null when the role is empty */
  colorByField: ColorByFieldIdentity | null
  /**
   * Per-category identity + automatic palette color, in Color-by/data order.
   * The store resolves effective colors (explicit override or automatic
   * fallback) from these before emitting to the viewer. Null when Color By is
   * not connected (colorByIds may still carry conditional-formatting groups).
   */
  colorByCategories: ColorByCategory[] | null
  objectTooltipData: Map<string, IViewerTooltip>
  /**
   * True when Power BI reports actual filters applied to this visual via
   * options.jsonFilters (slicers, filter pane). Chart-interaction (funnel)
   * filters do NOT surface here — see universeComplete for those.
   */
  hasActiveFilters: boolean
  /**
   * True when the paged row universe is COMPLETE (no segment remained).
   * Combined with the dictionary's total object count this detects funnel-mode
   * chart filters: a complete universe smaller than the model IS a filter.
   * False when paging hit the fetch budget (the ids are then a sample and must
   * not be applied as a filter).
   */
  universeComplete: boolean
}
