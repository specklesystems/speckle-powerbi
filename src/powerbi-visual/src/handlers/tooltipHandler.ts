import powerbi from 'powerbi-visuals-api'
import ITooltipService = powerbi.extensibility.ITooltipService
import { IViewerTooltip } from '../types'
import { SpeckleTooltip } from '../interfaces'

export default class TooltipHandler {
  private data: Map<string, IViewerTooltip>
  private tooltipService: ITooltipService
  public currentTooltip: SpeckleTooltip = null

  constructor(tooltipService) {
    this.tooltipService = tooltipService
    this.data = new Map<string, IViewerTooltip>()
  }

  public setup(data: Map<string, IViewerTooltip>) {
    this.data = data
  }

  public show(hit: { guid: string; object?; point }, screenLoc) {
    const id = hit.object.id as string
    const objTooltipData: IViewerTooltip = this.data.get(id)
    if (!objTooltipData) return

    const tooltipData = {
      coordinates: [screenLoc.x, screenLoc.y],
      dataItems: objTooltipData.data,
      identities: [objTooltipData.selectionId],
      isTouchEvent: false
    }

    this.currentTooltip = {
      id: hit.object.id,
      worldPos: hit.point,
      screenPos: screenLoc,
      tooltip: tooltipData
    }

    this.tooltipService.show(tooltipData)
    if (Object.keys(tooltipData.dataItems).length > 0) this.tooltipService.show(tooltipData)
  }

  public hide() {
    this.tooltipService.hide({ immediately: true, isTouchEvent: false })
    this.currentTooltip = null
  }

  public move(pos: { x: number; y: number }) {
    if (!this.currentTooltip) return
    this.currentTooltip.tooltip.coordinates = [pos.x, pos.y]
    this.tooltipService.move(this.currentTooltip.tooltip)
  }
}
