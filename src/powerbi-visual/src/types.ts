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
  objectsToLoad: string[]
  objectIds: string[]
  selectedIds: string[]
  colorByIds: { objectIds: string[]; slice: fs.ColorPicker; color: string }[]
  objectTooltipData: Map<string, IViewerTooltip>
  view: powerbi.DataViewMatrix
}
