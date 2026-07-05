import { DecodedModelInfo } from '@src/utils/decodeUserInfo'

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
  /** applicationIds of all data rows */
  objectIds: string[]
  selectedIds: string[]
  colorByIds: { objectIds: string[]; color: string }[] | null
  objectTooltipData: Map<string, IViewerTooltip>
}
