export default class SelectionHandler {
  private selectionIdMap: Map<string, powerbi.extensibility.ISelectionId>
  private currentSelection: Set<string>
  private selectionManager: powerbi.extensibility.ISelectionManager
  private host: powerbi.extensibility.visual.IVisualHost

  public constructor(host: powerbi.extensibility.visual.IVisualHost) {
    this.host = host
    this.selectionManager = this.host.createSelectionManager()
    this.selectionIdMap = new Map<string, powerbi.extensibility.ISelectionId>()
    this.currentSelection = new Set<string>()
  }

  public async showContextMenu(ev: MouseEvent, hit?) {
    const selectionId = !hit ? null : this.selectionIdMap.get(hit?.object?.id)

    return this.selectionManager.showContextMenu(selectionId, {
      x: ev.clientX,
      y: ev.clientY
    })
  }

  public set(objectId: string, data: powerbi.extensibility.ISelectionId) {
    this.selectionIdMap.set(objectId, data)
  }

  public async select(objectId: string, multi = false) {
    const selectionId = this.selectionIdMap.get(objectId)
    if (multi) {
      await this.selectionManager.select(selectionId, true)
      if (this.currentSelection.has(objectId)) {
        this.currentSelection.delete(objectId)
      } else {
        this.currentSelection.add(objectId)
      }
    } else {
      await this.selectionManager.select(selectionId, false)
      this.currentSelection.clear()
      this.currentSelection.add(objectId)
    }
  }

  public getCurrentSelection(): { id: string; selectionId: powerbi.extensibility.ISelectionId }[] {
    return [...this.currentSelection].map((entry) => ({
      id: entry,
      selectionId: this.selectionIdMap.get(entry)
    }))
  }

  public isSelected(id: string) {
    return this.currentSelection.has(id)
  }
  public clear() {
    this.selectionManager.clear()
    this.currentSelection.clear()
  }

  public reset() {
    this.clear()
    this.selectionIdMap.clear()
  }

  public has(url) {
    return this.selectionIdMap.has(url)
  }
}
