// Vendored from @speckle/ts-sdk (packages/ts-sdk/src/viewer/objects/state.ts, speckle-server-internal@speckle/next).
// @speckle/ts-sdk is private/unpublished; keep this copy in sync until it ships.
/**
 * Visibility state and its pure reducer — the policy home of the layer.
 *
 * State is per-model integer sets. The reducer is a pure, synchronous function
 * of (state, command) → state, which is what lets undo recompute any retained
 * state by re-reducing the command log from a checkpoint (see interactions.ts)
 * instead of maintaining inverse operations.
 *
 * Locked policy:
 *  - hide is additive; show subtracts (they reset each other)
 *  - isolate is additive with an active isolation and CLEARS explicit hides
 *    (an isolate expresses fresh intent about what is visible)
 *  - unisolate subtracts; an emptied isolation set ends isolation
 *  - setIsolation replaces the whole isolation (and clears hides) in ONE
 *    command — the single-repaint form of "showAll then isolate"
 *  - showAll clears both
 */
import type { InteractionsSnapshot, ObjectGroup, ObjectRef } from './types.js'

export type ModelObjectSets = Map<string, Set<number>>

export interface VisibilityState {
  hidden: ModelObjectSets
  isolatedTo: ModelObjectSets | null
}

/**
 * The composed visibility inputs paint evaluates: the undoable manual state
 * plus the non-undoable filter channel. Kept as two separate channels on
 * purpose — this is the ghosting seam: a future ghost mode reinterprets
 * `filter` at the paint layer only (ghost material instead of hide), with no
 * change to state, snapshot, or API.
 */
export interface VisibilityView {
  manual: VisibilityState
  /**
   * Allow-set per model; null = no filter. A non-null empty map is an active
   * filter matching nothing (everything filter-hides).
   */
  filter: ModelObjectSets | null
}

export type VisibilityCommand =
  | { type: 'hide'; groups: ObjectGroup[] }
  | { type: 'show'; groups: ObjectGroup[] }
  | { type: 'isolate'; groups: ObjectGroup[] }
  | { type: 'unisolate'; groups: ObjectGroup[] }
  | { type: 'setIsolation'; groups: ObjectGroup[] }
  | { type: 'showAll' }

export const initialState = (): VisibilityState => ({
  hidden: new Map(),
  isolatedTo: null
})

const cloneSets = (sets: ModelObjectSets): ModelObjectSets => {
  const out: ModelObjectSets = new Map()
  for (const [modelId, set] of sets) out.set(modelId, new Set(set))
  return out
}

const unionInto = (sets: ModelObjectSets, groups: ObjectGroup[]): void => {
  for (const group of groups) {
    if (group.objectIndexes.length === 0) continue
    const set = sets.get(group.modelId) ?? new Set<number>()
    for (const objectIndex of group.objectIndexes) set.add(objectIndex)
    sets.set(group.modelId, set)
  }
}

const subtractFrom = (sets: ModelObjectSets, groups: ObjectGroup[]): void => {
  for (const group of groups) {
    const set = sets.get(group.modelId)
    if (!set) continue
    for (const objectIndex of group.objectIndexes) set.delete(objectIndex)
    if (set.size === 0) sets.delete(group.modelId)
  }
}

export const reduce = (
  state: VisibilityState,
  command: VisibilityCommand
): VisibilityState => {
  switch (command.type) {
    case 'hide': {
      const hidden = cloneSets(state.hidden)
      unionInto(hidden, command.groups)
      return { hidden, isolatedTo: state.isolatedTo }
    }
    case 'show': {
      const hidden = cloneSets(state.hidden)
      subtractFrom(hidden, command.groups)
      return { hidden, isolatedTo: state.isolatedTo }
    }
    case 'isolate': {
      const isolatedTo: ModelObjectSets = state.isolatedTo
        ? cloneSets(state.isolatedTo)
        : new Map<string, Set<number>>()
      unionInto(isolatedTo, command.groups)
      // Fresh visibility intent: explicit hides are cleared.
      return { hidden: new Map(), isolatedTo }
    }
    case 'unisolate': {
      if (!state.isolatedTo) return state
      const isolatedTo = cloneSets(state.isolatedTo)
      subtractFrom(isolatedTo, command.groups)
      return {
        hidden: state.hidden,
        isolatedTo: isolatedTo.size === 0 ? null : isolatedTo
      }
    }
    case 'setIsolation': {
      // Replace semantics: the isolation becomes exactly these objects — one
      // command, one repaint (no showAll-then-isolate pair). Fresh visibility
      // intent like `isolate`, so explicit hides clear; empty groups end
      // isolation entirely.
      const isolatedTo = groupsToSets(command.groups)
      return {
        hidden: new Map(),
        isolatedTo: isolatedTo.size === 0 ? null : isolatedTo
      }
    }
    case 'showAll':
      return initialState()
  }
}

/** Build fresh per-model sets from groups — the normaliser behind setFilter's replace semantics. */
export const groupsToSets = (groups: ObjectGroup[]): ModelObjectSets => {
  const sets: ModelObjectSets = new Map()
  unionInto(sets, groups)
  return sets
}

/**
 * The colour channel's canonical shape: per model, object index → packed
 * `0xRRGGBBAA` colour. Built from {@link ColorGroup}s; later groups win on
 * overlap.
 */
export type ModelObjectColors = Map<string, Map<number, number>>

/** One model's worth of colour assignments (packed 0xRRGGBBAA). */
export interface ColorGroup {
  modelId: string
  objectIndexes: number[]
  /** Packed 0xRRGGBBAA. */
  color: number
}

/** Build fresh per-model colour maps — the normaliser behind setColors's replace semantics. */
export const colorGroupsToMap = (groups: ColorGroup[]): ModelObjectColors => {
  const out: ModelObjectColors = new Map()
  for (const group of groups) {
    if (group.objectIndexes.length === 0) continue
    const map = out.get(group.modelId) ?? new Map<number, number>()
    for (const objectIndex of group.objectIndexes) map.set(objectIndex, group.color)
    out.set(group.modelId, map)
  }
  return out
}

/** Value equality of two colour channels — setColors's no-op guard. */
export const colorsEqual = (a: ModelObjectColors, b: ModelObjectColors): boolean => {
  if (a === b) return true
  if (a.size !== b.size) return false
  for (const [modelId, aMap] of a) {
    const bMap = b.get(modelId)
    if (!bMap || bMap.size !== aMap.size) return false
    for (const [objectIndex, color] of aMap) {
      if (bMap.get(objectIndex) !== color) return false
    }
  }
  return true
}

export const setsEqual = (a: ModelObjectSets, b: ModelObjectSets): boolean => {
  if (a === b) return true
  if (a.size !== b.size) return false
  for (const [modelId, aSet] of a) {
    const bSet = b.get(modelId)
    if (!bSet || bSet.size !== aSet.size) return false
    for (const objectIndex of aSet) if (!bSet.has(objectIndex)) return false
  }
  return true
}

/** Value equality — the no-op guard (unchanged commands never enter history). */
export const statesEqual = (a: VisibilityState, b: VisibilityState): boolean => {
  if (!setsEqual(a.hidden, b.hidden)) return false
  if (a.isolatedTo === b.isolatedTo) return true
  if (a.isolatedTo === null || b.isolatedTo === null) return false
  return setsEqual(a.isolatedTo, b.isolatedTo)
}

// ── containment queries ──────────────────────────────────────────────────────
// Subset semantics on purpose: a group counts only when EVERY one of its
// indexes is in the sets. A partially covered group reads as "not contained",
// so a toggle on it completes the containment rather than reversing it — the
// standard tri-state checkbox simplification.

/**
 * True when every index of every group is present in the per-model sets and
 * the groups carry at least one index (an empty command contains nothing).
 */
export const setsContainGroups = (
  sets: ReadonlyMap<string, ReadonlySet<number>> | null,
  groups: ObjectGroup[]
): boolean => {
  if (!sets) return false
  let anyIndexes = false
  for (const group of groups) {
    if (group.objectIndexes.length === 0) continue
    anyIndexes = true
    const set = sets.get(group.modelId)
    if (!set) return false
    for (const objectIndex of group.objectIndexes) {
      if (!set.has(objectIndex)) return false
    }
  }
  return anyIndexes
}

/**
 * Whether these objects are all inside the active isolation (false when not
 * isolated). The read behind toggle-aware isolate buttons.
 */
export const isIsolated = (
  snapshot: Pick<InteractionsSnapshot, 'isolatedTo'>,
  groups: ObjectGroup[]
): boolean => setsContainGroups(snapshot.isolatedTo, groups)

/** Whether these objects are all explicitly hidden. */
export const isHidden = (
  snapshot: Pick<InteractionsSnapshot, 'hidden'>,
  groups: ObjectGroup[]
): boolean => setsContainGroups(snapshot.hidden, groups)

/** Tri-state group containment: every index present / some / none. */
export type Containment = 'all' | 'some' | 'none'

/**
 * Tri-state variant of {@link setsContainGroups} for UIs that distinguish a
 * fully covered row from a partially covered one. Kept separate from the
 * boolean check on purpose: the subset check exits on the first miss, while
 * this one must keep scanning until it has seen both a hit and a miss.
 * All-empty input reads 'none'.
 */
export const containmentOf = (
  sets: ReadonlyMap<string, ReadonlySet<number>> | null,
  groups: ObjectGroup[]
): Containment => {
  if (!sets) return 'none'
  let hit = false
  let miss = false
  for (const group of groups) {
    if (group.objectIndexes.length === 0) continue
    const set = sets.get(group.modelId)
    if (!set || set.size === 0) {
      miss = true
      if (hit) return 'some'
      continue
    }
    for (const objectIndex of group.objectIndexes) {
      if (set.has(objectIndex)) hit = true
      else miss = true
      if (hit && miss) return 'some'
    }
  }
  return hit ? (miss ? 'some' : 'all') : 'none'
}

/** Tri-state read of how much of these objects the active isolation covers. */
export const isolationContainment = (
  snapshot: Pick<InteractionsSnapshot, 'isolatedTo'>,
  groups: ObjectGroup[]
): Containment => containmentOf(snapshot.isolatedTo, groups)

/** Tri-state read of how much of these objects is explicitly hidden. */
export const hiddenContainment = (
  snapshot: Pick<InteractionsSnapshot, 'hidden'>,
  groups: ObjectGroup[]
): Containment => containmentOf(snapshot.hidden, groups)

/** Tri-state read of how much of these objects the active filter covers ('none' when no filter). */
export const filterContainment = (
  snapshot: Pick<InteractionsSnapshot, 'filteredTo'>,
  groups: ObjectGroup[]
): Containment => containmentOf(snapshot.filteredTo, groups)

/**
 * Whole-model containment in O(1): a model's object indexes are the dense
 * range `0..objectCount-1` and a channel's per-model set only ever holds
 * indexes from that range, so coverage is decided by set size alone — no
 * scan. This keeps per-model UI state (model header buttons) free even on
 * multi-million-object models, where the generic {@link containmentOf}
 * would walk the whole range on every snapshot change.
 */
export const modelContainmentOf = (
  sets: ReadonlyMap<string, ReadonlySet<number>> | null,
  modelId: string,
  objectCount: number
): Containment => {
  if (!sets || objectCount <= 0) return 'none'
  const size = sets.get(modelId)?.size ?? 0
  if (size === 0) return 'none'
  return size >= objectCount ? 'all' : 'some'
}

/** Tri-state read of how much of one whole model the active isolation covers. */
export const modelIsolationContainment = (
  snapshot: Pick<InteractionsSnapshot, 'isolatedTo'>,
  modelId: string,
  objectCount: number
): Containment => modelContainmentOf(snapshot.isolatedTo, modelId, objectCount)

/** Tri-state read of how much of one whole model is explicitly hidden. */
export const modelHiddenContainment = (
  snapshot: Pick<InteractionsSnapshot, 'hidden'>,
  modelId: string,
  objectCount: number
): Containment => modelContainmentOf(snapshot.hidden, modelId, objectCount)

/**
 * Group refs by model — the bridge from a selection (per-object refs) to the
 * per-model groups every bulk command and containment query speaks.
 */
export const refsToGroups = (refs: ObjectRef[]): ObjectGroup[] => {
  const byModel = new Map<string, number[]>()
  for (const ref of refs) {
    const list = byModel.get(ref.modelId) ?? []
    list.push(ref.objectIndex)
    byModel.set(ref.modelId, list)
  }
  return [...byModel.entries()].map(([modelId, objectIndexes]) => ({
    modelId,
    objectIndexes
  }))
}
