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

  public set(url: string, data: powerbi.extensibility.ISelectionId) {
    this.selectionIdMap.set(url, data)
  }
  public async select(url: string, multi = false) {
    if (multi) {
      await this.selectionManager.select(this.selectionIdMap.get(url), true)
      if (this.currentSelection.has(url)) this.currentSelection.delete(url)
      else this.currentSelection.add(url)
    } else {
      await this.selectionManager.select(this.selectionIdMap.get(url), false)
      this.currentSelection.clear()
      this.currentSelection.add(url)
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
