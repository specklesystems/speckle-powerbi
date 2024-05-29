import { IViewerTooltipData } from './types'

export interface SpeckleSelectionData {
  id: powerbi.extensibility.ISelectionId
  data: IViewerTooltipData[]
}

export interface SpeckleTooltip {
  worldPos: {
    x: number
    y: number
    z: number
  }
  screenPos: {
    x: number
    y: number
  }
  tooltip
  id: string
}
