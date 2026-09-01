// Vendored-adjacent to @speckle/ts-sdk (packages/ts-sdk/src/viewer/…, speckle-server-internal@speckle/next).
// @speckle/ts-sdk is private/unpublished; upstream needs this same shim for viewer-webgpu >= 2026.8.31.
/**
 * The placement↔object maps, rebuilt host-side.
 *
 * Up to viewer-webgpu 2026.8.28 the renderer handed these out directly
 * (`Renderer.getModelMaps`): a per-model reverse CSR of GLOBAL placement ids
 * plus a global forward map. 2026.8.31 removed that accessor and replaced the
 * data with model-local REALIZATION semantics, delivered exactly once — in the
 * `viewer:loadArtifactComplete` payload. Holding the maps is now the host's
 * job, so this cache is where the old contract is reconstituted.
 *
 * Two facts drive the implementation:
 *
 *  - `placementRealizationIdx` is model-local (index p = the model's p-th
 *    placement, meshes then lines). The global placement id the renderer's
 *    paint API speaks is `placementRange[0] + p`.
 *  - That base MOVES: unloading an earlier model compacts the placement SoA
 *    and shifts every survivor's range down. The old viewer rebased its own
 *    CSR in place on `removeModel`; nothing does that for us now, so `get()`
 *    re-reads the live range and rebases when it has drifted.
 *
 * The derived arrays are built once per load (a counting sort, the same shape
 * the viewer used to build internally) and then only ever shifted, so paint
 * loops calling `get()` per model stay allocation-free.
 */
import type { Renderer } from '@speckle/viewer-webgpu'
import type { ViewerModelMaps } from './objects/types.js'

/** The `viewer:loadArtifactComplete` semantics payload (viewer-webgpu >= 2026.8.31). */
export interface SemanticMaps {
  /** Model-local placement index → realization id. Length = the model's placement count. */
  placementRealizationIdx: Uint32Array
  /** Realization id → dense object index. Instances share an object. */
  realizationObjectIdx: Uint32Array
  objectCount: number
}

interface Entry {
  /** Object index → slice bounds into `placements`. Length objectCount + 1. */
  offsets: Uint32Array
  /** Placement ids grouped by object — GLOBAL, valid for `base`. */
  placements: Uint32Array
  /** The placement-range start `placements` is currently expressed against. */
  base: number
  semantics: SemanticMaps
  /** Handed to consumers as-is; `placements` is mutated in place under it. */
  view: ViewerModelMaps
}

export interface ModelMapsCache {
  /** Ingest a load event. */
  register(modelId: string, semantics: SemanticMaps): void
  /** Drop one model, or the whole scene when null. */
  unregister(modelId: string | null): void
  /** The renderer to read live placement ranges from; null unbinds. */
  bind(renderer: Renderer | null): void
  /** Null when the model never loaded, already unloaded, or has no live range. */
  get(modelId: string): ViewerModelMaps | null
  clear(): void
}

/**
 * Counting-sort the model-local placements by owning object, then bias into
 * global ids. Placements whose realization resolves outside `objectCount` are
 * dropped rather than trusted — a corrupt lane must not smear paint onto a
 * neighbouring object.
 */
const buildCsr = (
  semantics: SemanticMaps,
  base: number
): { offsets: Uint32Array; placements: Uint32Array } => {
  const { placementRealizationIdx, realizationObjectIdx, objectCount } = semantics
  const placementCount = placementRealizationIdx.length
  const offsets = new Uint32Array(objectCount + 1)

  /** The object a model-local placement paints, or -1 when unresolvable. */
  const objectOf = (localPlacement: number): number => {
    const realization = placementRealizationIdx[localPlacement]
    if (realization === undefined || realization >= realizationObjectIdx.length) return -1
    const objectIndex = realizationObjectIdx[realization]
    if (objectIndex === undefined || objectIndex >= objectCount) return -1
    return objectIndex
  }

  for (let p = 0; p < placementCount; p++) {
    const objectIndex = objectOf(p)
    if (objectIndex >= 0) offsets[objectIndex + 1]++
  }
  for (let o = 0; o < objectCount; o++) offsets[o + 1] += offsets[o]

  const placements = new Uint32Array(offsets[objectCount])
  const cursor = offsets.slice(0, objectCount)
  for (let p = 0; p < placementCount; p++) {
    const objectIndex = objectOf(p)
    if (objectIndex >= 0) placements[cursor[objectIndex]++] = base + p
  }
  return { offsets, placements }
}

export const createModelMapsCache = (): ModelMapsCache => {
  const entries = new Map<string, Entry>()
  let live: Renderer | null = null

  /** The model's current global placement base, or null when it has no range. */
  const baseOf = (modelId: string): number | null => {
    const range = live?.getModelPlacementRange(modelId)
    return range ? range[0] : null
  }

  const makeEntry = (modelId: string, semantics: SemanticMaps): Entry => {
    const base = baseOf(modelId) ?? 0
    const { offsets, placements } = buildCsr(semantics, base)
    const entry: Entry = {
      offsets,
      placements,
      base,
      semantics,
      // Placeholder; replaced below so the view can close over `entry`.
      view: null as unknown as ViewerModelMaps
    }
    entry.view = {
      objectCsr: {
        offsets,
        placements,
        objectCount: semantics.objectCount
      },
      objectOfPlacement: (placementIndex: number): number | undefined => {
        const local = placementIndex - entry.base
        if (local < 0 || local >= entry.semantics.placementRealizationIdx.length) {
          return undefined
        }
        const realization = entry.semantics.placementRealizationIdx[local]
        if (realization === undefined) return undefined
        const objectIndex = entry.semantics.realizationObjectIdx[realization]
        if (objectIndex === undefined || objectIndex >= entry.semantics.objectCount) {
          return undefined
        }
        return objectIndex
      }
    }
    return entry
  }

  return {
    register: (modelId, semantics): void => {
      entries.set(modelId, makeEntry(modelId, semantics))
    },

    unregister: (modelId): void => {
      if (modelId === null) entries.clear()
      else entries.delete(modelId)
    },

    bind: (renderer): void => {
      live = renderer
    },

    get: (modelId): ViewerModelMaps | null => {
      const entry = entries.get(modelId)
      if (!entry) return null
      // No live range = the model is gone from the scene (or the renderer is
      // unbound): report not-loaded rather than serve stale global ids.
      const base = baseOf(modelId)
      if (base === null) return null
      if (base !== entry.base) {
        const shift = base - entry.base
        for (let i = 0; i < entry.placements.length; i++) entry.placements[i] += shift
        entry.base = base
      }
      return entry.view
    },

    clear: (): void => {
      entries.clear()
      live = null
    }
  }
}
