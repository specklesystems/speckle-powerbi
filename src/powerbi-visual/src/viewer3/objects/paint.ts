// Vendored from @speckle/ts-sdk (packages/ts-sdk/src/viewer/objects/paint.ts, speckle-server-internal@speckle/next).
// @speckle/ts-sdk is private/unpublished; keep this copy in sync until it ships.
/**
 * Paint execution: translate accumulated interaction state into the
 * renderer's placement API.
 *
 * The layer paints ONCE per gesture (see the scheduler in interactions.ts):
 * commands only mutate state; a flush at end-of-microtask compiles the final
 * state into renderer calls. Two paint strategies:
 *
 *  - {@link paintEffectiveState} — the fused slam: hide everything, show the
 *    visible-but-untinted survivors, then one setColor per distinct tint.
 *    Exploits the renderer's single per-placement material slot: a tint
 *    carries its own visibility (alpha rides the slot), so tinted placements
 *    are never shown twice. Used for any composite flush and for every
 *    command whose effect isn't a cheap forward delta.
 *  - forward deltas ({@link paintGroups}, {@link paintFilterDelta},
 *    {@link paintOverlaysDiff}) — when a flush contains exactly one small
 *    change (a hide/show of a few objects, a filter edit, a colour/selection
 *    change), only the difference paints. A full slam per tree-row eye
 *    toggle would hurt at whale scale.
 *
 * Models are read from the renderer's own maps at execution time; ids for
 * models that aren't (or are no longer) loaded skip silently. Object indexes
 * are the stored currency; placements are ALWAYS derived here at paint time
 * (the forward map is not survivor-shifted on model unload — caching
 * placements would be a bug).
 */
import type { ObjectGroup, ObjectRef, ViewerHandle, ViewerModelMaps } from './types.js'
import type {
  ModelObjectColors,
  ModelObjectSets,
  VisibilityState,
  VisibilityView
} from './state.js'

/** What the painter last tinted, per model: objectIndex → packed colour. */
export type PaintedOverlays = ReadonlyMap<string, ReadonlyMap<number, number>>

/** Expand object indexes to their placement ids through a model's reverse CSR. */
const expandToPlacements = (
  maps: ViewerModelMaps,
  objectIndexes: Iterable<number>
): number[] => {
  const { offsets, placements, objectCount } = maps.objectCsr
  const out: number[] = []
  for (const objectIndex of objectIndexes) {
    if (objectIndex < 0 || objectIndex >= objectCount) continue
    const start = offsets[objectIndex] ?? 0
    const end = offsets[objectIndex + 1] ?? 0
    for (let i = start; i < end; i++) out.push(placements[i])
  }
  return out
}

/**
 * Every object of one loaded model as a single group — the bridge from
 * model-grain UI verbs ("isolate this model") to the layer's object-grain
 * commands. Object indexes are dense `0..objectCount-1` by construction, so
 * the group is built straight off the viewer's maps with no data-plane query.
 * Null when the model isn't (or is no longer) loaded.
 */
export const allObjectsOf = (
  renderer: ViewerHandle,
  modelId: string
): ObjectGroup | null => {
  const maps = renderer.getModelMaps(modelId)
  if (!maps) return null
  const { objectCount } = maps.objectCsr
  return {
    modelId,
    objectIndexes: Array.from({ length: objectCount }, (_, objectIndex) => objectIndex)
  }
}

/** The object count of one loaded model (0 when not loaded) — pairs with the O(1) model containment reads. */
export const objectCountOf = (renderer: ViewerHandle, modelId: string): number =>
  renderer.getModelMaps(modelId)?.objectCsr.objectCount ?? 0

/** Whether an object survives the current filter/hidden/isolation channels. */
const isEffectivelyVisible = (
  view: VisibilityView,
  modelId: string,
  objectIndex: number
): boolean => {
  if (view.filter && view.filter.get(modelId)?.has(objectIndex) !== true) return false
  const { manual } = view
  if (manual.hidden.get(modelId)?.has(objectIndex)) return false
  if (manual.isolatedTo) {
    return manual.isolatedTo.get(modelId)?.has(objectIndex) === true
  }
  return true
}

/**
 * The desired tints of one model's visible objects: the selection highlight
 * wins over the colour channel (a selected object shows blue, reverting to
 * its channel colour on deselect). Absent = authored material.
 */
const desiredTintsFor = (input: {
  modelId: string
  colors: ModelObjectColors | null
  selectionByModel: ReadonlyMap<string, ReadonlySet<number>>
  selectionColor: number
}): Map<number, number> => {
  const out = new Map<number, number>()
  const channel = input.colors?.get(input.modelId)
  if (channel) for (const [objectIndex, color] of channel) out.set(objectIndex, color)
  const selected = input.selectionByModel.get(input.modelId)
  if (selected) {
    for (const objectIndex of selected) out.set(objectIndex, input.selectionColor)
  }
  return out
}

/** Group the selection refs per model for tint derivation. */
const selectionByModel = (
  selection: ObjectRef[]
): ReadonlyMap<string, ReadonlySet<number>> => {
  const out = new Map<string, Set<number>>()
  for (const ref of selection) {
    const set = out.get(ref.modelId) ?? new Set<number>()
    set.add(ref.objectIndex)
    out.set(ref.modelId, set)
  }
  return out
}

/** Paint one set of groups to a single visibility. Unknown models skip. */
export const paintGroups = (
  renderer: ViewerHandle,
  groups: ObjectGroup[],
  visible: boolean
): void => {
  let touched = false
  for (const group of groups) {
    if (group.objectIndexes.length === 0) continue
    const maps = renderer.getModelMaps(group.modelId)
    if (!maps) continue
    const placements = expandToPlacements(maps, group.objectIndexes)
    if (placements.length === 0) continue
    if (visible) renderer.showObjects(placements)
    else renderer.hideObjects(placements)
    touched = true
  }
  // The viewer renders on demand: without an explicit frame request the new
  // visibility only shows up on the next camera move.
  if (touched) renderer.requestRender()
}

/**
 * Diff-paint the overlays (colour channel + selection tint): reset tints
 * that ceased to exist, paint tints that are new or changed, skip tints the
 * previous map already shows. Valid ONLY in flushes where no visibility
 * paint ran — a visibility paint clobbers slots behind the map's back; those
 * flushes use {@link paintEffectiveState}, which repaints everything.
 *
 * Returns the new painted map, rebuilt from desired∩visible — entries for
 * objects that went invisible drop out automatically, so the map never
 * claims a tint the slot doesn't hold.
 */
export const paintOverlaysDiff = (input: {
  renderer: ViewerHandle
  previous: PaintedOverlays
  selection: ObjectRef[]
  colors: ModelObjectColors | null
  view: VisibilityView
  /** Packed 0xRRGGBBAA selection highlight colour. */
  selectionColor: number
}): PaintedOverlays => {
  const { renderer, previous, selection, colors, view, selectionColor } = input
  const byModel = selectionByModel(selection)
  const modelIds = new Set<string>([
    ...previous.keys(),
    ...(colors?.keys() ?? []),
    ...byModel.keys()
  ])

  let touched = false
  const painted = new Map<string, Map<number, number>>()

  for (const modelId of modelIds) {
    const maps = renderer.getModelMaps(modelId)
    if (!maps) continue
    const desired = desiredTintsFor({
      modelId,
      colors,
      selectionByModel: byModel,
      selectionColor
    })
    const previousByObject = previous.get(modelId)

    // Reset pass: previously tinted objects with no tint anymore go back to
    // the authored material. The renderer's show/hide writes ONLY the alpha
    // channel of the shared material slot, so a stale tint RGB survives
    // visibility flips — invisible leavers must ALSO heal, via restore (full
    // authored RGBA, which would resurrect them) immediately re-hidden.
    if (previousByObject) {
      const leavingVisible: number[] = []
      const leavingInvisible: number[] = []
      for (const objectIndex of previousByObject.keys()) {
        if (desired.has(objectIndex)) continue
        if (isEffectivelyVisible(view, modelId, objectIndex)) {
          leavingVisible.push(objectIndex)
        } else {
          leavingInvisible.push(objectIndex)
        }
      }
      const visiblePlacements = expandToPlacements(maps, leavingVisible)
      if (visiblePlacements.length) {
        renderer.resetMaterials(visiblePlacements)
        touched = true
      }
      const invisiblePlacements = expandToPlacements(maps, leavingInvisible)
      if (invisiblePlacements.length) {
        renderer.resetMaterials(invisiblePlacements)
        renderer.hideObjects(invisiblePlacements)
        touched = true
      }
    }

    // Tint pass: visible desired tints, batched per colour, skipping objects
    // the previous map already shows in the same colour.
    const byColor = new Map<number, number[]>()
    const paintedByObject = new Map<number, number>()
    for (const [objectIndex, color] of desired) {
      if (!isEffectivelyVisible(view, modelId, objectIndex)) continue
      paintedByObject.set(objectIndex, color)
      if (previousByObject?.get(objectIndex) === color) continue
      const list = byColor.get(color) ?? []
      list.push(objectIndex)
      byColor.set(color, list)
    }
    for (const [color, objectIndexes] of byColor) {
      const placements = expandToPlacements(maps, objectIndexes)
      if (!placements.length) continue
      renderer.setColor(placements, color)
      touched = true
    }
    if (paintedByObject.size) painted.set(modelId, paintedByObject)
  }

  if (touched) renderer.requestRender()
  return painted
}

/**
 * Slam the complete effective state of every target model in ONE pass — the
 * whole-gesture paint the scheduler emits for composite flushes and for any
 * command that isn't a cheap forward delta (isolate, showAll, undo/redo,
 * filter activation/clearing…).
 *
 * Per model, exploiting the single material slot (a tint IS a show):
 *
 *   allow-set active:  hide everything → show visible∖tinted → tint batches
 *   no allow-set:      show everything → hide hidden → tint batches
 *
 * Exactly one requestRender at the end. Returns the fresh painted-overlays
 * map (what is tinted NOW), which seeds the next diff flush.
 */
export const paintEffectiveState = (input: {
  renderer: ViewerHandle
  view: VisibilityView
  selection: ObjectRef[]
  colors: ModelObjectColors | null
  /** What was tinted before this slam — its leaving entries need explicit restores. */
  previous: PaintedOverlays
  /** Packed 0xRRGGBBAA selection highlight colour. */
  selectionColor: number
  /** Models to repaint: the roster ∪ every model key in the painted state. */
  targets: Iterable<string>
}): PaintedOverlays => {
  const { renderer, view, selection, colors, previous, selectionColor, targets } = input
  const { manual, filter } = view
  const byModel = selectionByModel(selection)
  const painted = new Map<string, Map<number, number>>()

  for (const modelId of targets) {
    const maps = renderer.getModelMaps(modelId)
    if (!maps) continue
    const hidden = manual.hidden.get(modelId)
    const tints = desiredTintsFor({
      modelId,
      colors,
      selectionByModel: byModel,
      selectionColor
    })

    // Restore leaving tints FIRST: the renderer's show/hide writes only the
    // alpha channel of the shared slot, so "show everything" does NOT clear a
    // stale tint's RGB — it must be explicitly reset to the authored
    // material. Running before the branch's hide/show slam means the slam's
    // alpha writes land on healed RGB, whatever the final visibility.
    const previousByObject = previous.get(modelId)
    if (previousByObject) {
      const leaving: number[] = []
      for (const objectIndex of previousByObject.keys()) {
        if (!tints.has(objectIndex)) leaving.push(objectIndex)
      }
      const leavingPlacements = expandToPlacements(maps, leaving)
      if (leavingPlacements.length) renderer.resetMaterials(leavingPlacements)
    }

    const byColor = new Map<number, number[]>()
    const paintedByObject = new Map<number, number>()
    /** Bucket a visible object's tint; false = untinted (authored material). */
    const bucketTint = (objectIndex: number): boolean => {
      const color = tints.get(objectIndex)
      if (color === undefined) return false
      const list = byColor.get(color) ?? []
      list.push(objectIndex)
      byColor.set(color, list)
      paintedByObject.set(objectIndex, color)
      return true
    }

    if (filter || manual.isolatedTo) {
      // Allow-listed: hide the whole model, then show/tint the surviving base.
      renderer.hideObjects(Array.from(maps.objectCsr.placements))
      const filterSet = filter?.get(modelId)
      const isolatedSet = manual.isolatedTo?.get(modelId)
      // An active channel with no entries for this model allows nothing.
      if (filter && !filterSet?.size) continue
      if (manual.isolatedTo && !isolatedSet?.size) continue

      let base: Iterable<number>
      if (filterSet && isolatedSet) {
        // Both channels active: intersect, iterating the smaller set.
        const [small, large] =
          filterSet.size <= isolatedSet.size
            ? [filterSet, isolatedSet]
            : [isolatedSet, filterSet]
        const both: number[] = []
        for (const objectIndex of small) {
          if (large.has(objectIndex)) both.push(objectIndex)
        }
        base = both
      } else {
        base = filterSet ?? isolatedSet ?? []
      }

      const untinted: number[] = []
      for (const objectIndex of base) {
        if (hidden?.has(objectIndex)) continue
        if (!bucketTint(objectIndex)) untinted.push(objectIndex)
      }
      const placements = expandToPlacements(maps, untinted)
      if (placements.length) renderer.showObjects(placements)
    } else {
      // No allow-set: show the whole model, re-hide the explicit hides, then
      // tint. Tints apply only to visible objects, and tinting after the
      // show/hide pair is what makes them stick (shared slot).
      renderer.showObjects(Array.from(maps.objectCsr.placements))
      if (hidden?.size) {
        const placements = expandToPlacements(maps, hidden)
        if (placements.length) renderer.hideObjects(placements)
      }
      for (const objectIndex of tints.keys()) {
        if (hidden?.has(objectIndex)) continue
        bucketTint(objectIndex)
      }
    }

    for (const [color, objectIndexes] of byColor) {
      const placements = expandToPlacements(maps, objectIndexes)
      if (placements.length) renderer.setColor(placements, color)
    }
    if (paintedByObject.size) painted.set(modelId, paintedByObject)
  }

  // A slam always repaints every target — request the frame unconditionally
  // (the viewer renders on demand; without this the result waits for a
  // camera move).
  renderer.requestRender()
  return painted
}

/**
 * Paint only the difference between two non-null filter sets (the manual
 * state is unchanged across a setFilter). Objects leaving the filter hide —
 * an idempotent no-op when they were already invisible; objects entering
 * show ONLY when the manual channels also allow them (showing a
 * manually-hidden or non-isolated object would wrongly resurrect it). The
 * scheduler follows this with {@link paintOverlaysDiff} so entering objects
 * regain their tints. Mode flips (null↔set) use the fused slam instead.
 */
export const paintFilterDelta = (input: {
  renderer: ViewerHandle
  previous: ModelObjectSets
  next: ModelObjectSets
  manual: VisibilityState
}): void => {
  const { renderer, previous, next, manual } = input
  const modelIds = new Set([...previous.keys(), ...next.keys()])
  let touched = false

  for (const modelId of modelIds) {
    const maps = renderer.getModelMaps(modelId)
    if (!maps) continue
    const prevSet = previous.get(modelId)
    const nextSet = next.get(modelId)
    const hidden = manual.hidden.get(modelId)
    const isolatedSet = manual.isolatedTo?.get(modelId)

    const leaving: number[] = []
    if (prevSet) {
      for (const objectIndex of prevSet) {
        if (nextSet?.has(objectIndex) !== true) leaving.push(objectIndex)
      }
    }

    const entering: number[] = []
    if (nextSet) {
      for (const objectIndex of nextSet) {
        if (prevSet?.has(objectIndex)) continue
        if (hidden?.has(objectIndex)) continue
        if (manual.isolatedTo && isolatedSet?.has(objectIndex) !== true) continue
        entering.push(objectIndex)
      }
    }

    if (leaving.length) {
      const placements = expandToPlacements(maps, leaving)
      if (placements.length) {
        renderer.hideObjects(placements)
        touched = true
      }
    }
    if (entering.length) {
      const placements = expandToPlacements(maps, entering)
      if (placements.length) {
        renderer.showObjects(placements)
        touched = true
      }
    }
  }

  if (touched) renderer.requestRender()
}
