/**
 * What a double-click should frame.
 *
 * viewer-webgpu did this itself up to 2026.8.21 (`fitToSphere` on the picked
 * primitive); 2026.8.31 reduced the renderer's role to emitting the hit list,
 * so the host owns the gesture. The resolution is pure and takes its renderer
 * reads as functions, which keeps it testable without a GPU — the same shape
 * `zoomToObjects` uses.
 */
import type { ObjectGroup, ViewerModelMaps } from './objects/types.js'

/** The only field of the renderer's RayPickResult this resolution needs. */
export interface PlacementHit {
  placementIndex: number
}

export type DoubleClickTarget =
  /** Empty space — frame the whole scene. */
  | { kind: 'extents' }
  /** Frame this object (all of its placements, not just the primitive hit). */
  | { kind: 'object'; group: ObjectGroup }
  /** Hits exist but resolve to nothing framable — leave the camera alone. */
  | { kind: 'none' }

export const resolveDoubleClickTarget = (input: {
  hits: readonly PlacementHit[] | null | undefined
  /**
   * The renderer's own visibility-aware hit filter. Using it (rather than
   * `hits[0]`, which is what the old renderer did) stops a double-click from
   * flying to geometry the user has hidden, isolated away or filtered out.
   */
  firstVisibleHit: (hits: readonly PlacementHit[]) => PlacementHit | null
  /** Which loaded model owns a global placement index. */
  modelAt: (placementIndex: number) => string | null
  getModelMaps: (modelId: string) => ViewerModelMaps | null
}): DoubleClickTarget => {
  const { hits, firstVisibleHit, modelAt, getModelMaps } = input
  if (!hits || hits.length === 0) return { kind: 'extents' }

  const hit = firstVisibleHit(hits)
  if (!hit) return { kind: 'none' }

  const modelId = modelAt(hit.placementIndex)
  if (!modelId) return { kind: 'none' }

  const objectIndex = getModelMaps(modelId)?.objectOfPlacement(hit.placementIndex)
  if (objectIndex === undefined) return { kind: 'none' }

  return { kind: 'object', group: { modelId, objectIndexes: [objectIndex] } }
}
