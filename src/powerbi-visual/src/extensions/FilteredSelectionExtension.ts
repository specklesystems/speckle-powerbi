import {
  CameraController,
  FilteringExtension,
  NodeRenderView,
  SelectionEvent,
  SelectionExtension,
  TreeNode,
  ObjectLayers,
  IViewer,
  ExtendedIntersection
} from '@speckle/viewer'
import { Vector2, Vector3 } from 'three'

export enum FilteredSelectionEvent {
  FilteredObjectClicked = 'filtered-object-clicked'
}

export interface FilteredSelectionEventPayload {
  [FilteredSelectionEvent.FilteredObjectClicked]: SelectionEvent | null
}

export class FilteredSelectionExtension extends SelectionExtension {
  // We're adding the Filtering Extension
  public get inject(): Array<new (viewer: IViewer, ...args: any[]) => any> {
    return [...super.inject, FilteringExtension]
  }

  public constructor(
    viewer: IViewer,
    protected cameraProvider: CameraController,
    protected filtering: FilteringExtension
  ) {
    super(viewer, cameraProvider)
  }

  public on<T extends FilteredSelectionEvent>(
    eventType: T,
    listener: (arg: FilteredSelectionEventPayload[T]) => void
  ): void {
    super.on(eventType, listener)
  }

  protected isVisibleForSelection(id: string): boolean
  protected isVisibleForSelection(rv: NodeRenderView): boolean
  protected isVisibleForSelection(input: string | NodeRenderView): boolean {
    if (input instanceof NodeRenderView) return this.isVisibleForSelectionRv(input)
    else if (typeof input === 'string') return this.isVisibleForSelectionId(input)
    return false
  }

  protected isVisibleForSelectionId(id: string): boolean {
    // The current filtering state
    const filteringState = this.filtering.filteringState

    // If there are no isolated objects, all objects are visible for selection
    if (!filteringState.isolatedObjects || filteringState.isolatedObjects.length === 0) {
      return true
    }

    // If there are isolated objects, only those objects are visible for selection
    return filteringState.isolatedObjects.includes(id)
  }

  protected isVisibleForSelectionRv(rv: NodeRenderView): boolean {
    // The current filtering state
    const filteringState = this.filtering.filteringState

    // If there are no isolated objects, all objects are visible for selection
    if (!filteringState.isolatedObjects || filteringState.isolatedObjects.length === 0) {
      return true
    }

    // Check if this render view belongs to any of the isolated objects
    for (let k = 0; k < filteringState.isolatedObjects.length; k++) {
      const rvs = this.viewer
        .getWorldTree()
        .getRenderTree()
        .getRenderViewsForNodeId(filteringState.isolatedObjects[k])
      if (rvs.includes(rv)) return true
    }
    return false
  }

  protected onObjectClicked(selection: SelectionEvent | null) {
    if (!selection) {
      super.onObjectClicked(selection)
      return
    }

    const filteredHits = []
    const filteredSelection = selection
      ? {
          event: selection.event,
          hits: filteredHits,
          multiple: selection.multiple
        }
      : null

    if (filteredSelection) {
      for (const hit of selection.hits) {
        if (this.isVisibleForSelection(hit.node.model.id)) {
          filteredHits.push(hit)
        }
      }
    }

    // Call base class with the filtered selection
    if (filteredSelection && filteredSelection.hits.length) {
      super.onObjectClicked(filteredSelection)
      this.emit(FilteredSelectionEvent.FilteredObjectClicked, filteredSelection)
    } else {
      // If no valid hits, treat as empty selection
      super.onObjectClicked(null)
    }
  }

  protected onPointerMove(e: Vector2 & { event: Event }) {
    if (!this._enabled) return
    const camera = this.viewer.getRenderer().renderingCamera
    if (!camera) return

    if (!this.options.hoverMaterialData) return
    const result =
      (this.viewer
        .getRenderer()
        .intersections.intersect(
          this.viewer.getRenderer().scene,
          camera,
          e,
          [
            ObjectLayers.STREAM_CONTENT_MESH,
            ObjectLayers.STREAM_CONTENT_POINT,
            ObjectLayers.STREAM_CONTENT_LINE,
            ObjectLayers.STREAM_CONTENT_TEXT
          ],
          true,
          this.viewer.getRenderer().clippingVolume
        ) as ExtendedIntersection[]) || []

    let rv = null
    for (let k = 0; k < result.length; k++) {
      rv = this.viewer.getRenderer().renderViewFromIntersection(result[k])
      if (this.isVisibleForSelection(rv)) break
      else rv = null
    }

    this.applyHover(rv)
  }
}
