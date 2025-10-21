import { formattingSettings as fs } from 'powerbi-visuals-utils-formattingmodel'
export interface IViewerTooltipData {
  displayName: string
  value: string
}

export interface IViewerTooltip {
  selectionId: powerbi.extensibility.ISelectionId
  data: IViewerTooltipData[]
}

export interface SpeckleDataInput {
  modelObjects: object[][]
  objectIds: string[]
  selectedIds: string[]
  colorByIds: { objectIds: string[]; slice: fs.ColorPicker; color: string }[]
  objectTooltipData: Map<string, IViewerTooltip>
  isFromStore: boolean
}

export interface ModelContextSettings {
  visible: boolean
  locked: boolean
  interactive: boolean
}

export interface ContextModeSettings {
  [rootObjectId: string]: ModelContextSettings
}

export interface ModelMetadata {
  rootObjectId: string
  modelName: string
}
