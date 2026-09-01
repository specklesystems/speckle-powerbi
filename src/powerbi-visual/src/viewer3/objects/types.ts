// Vendored from @speckle/ts-sdk (packages/ts-sdk/src/viewer/objects/types.ts, speckle-server-internal@speckle/next).
// @speckle/ts-sdk is private/unpublished; keep this copy in sync until it ships.
/**
 * Public contract of the viewer interactions layer.
 *
 * The layer is the single owner of viewer interaction state — selection and
 * visibility (hide/isolate) with undo/redo — and it drives a WebGPU viewer
 * renderer instance directly: consumers construct it with a
 * {@link ViewerHandle}, then issue commands and subscribe to an immutable
 * snapshot; they never touch the viewer's visibility API and never supply any
 * further wiring. Framework-free by construction: the snapshot store is the
 * exact `getSnapshot`/`subscribe` contract React's `useSyncExternalStore`
 * consumes natively, and a Vue mirror is a ~15-line composable.
 *
 * Object identity is the pair (modelId, dense objectIndex): the model id is
 * the viewer's own model/artifact id (object indexes collide across federated
 * models), the index is the bundle's dense integer. Bulk commands speak
 * {@link ObjectGroup} (one model's worth of indexes); a multi-model operation
 * is an array of groups and forms a single undo step.
 */

/**
 * The `.dat`-derived placement↔object maps of one loaded model: `objectCsr` is
 * the reverse CSR (object index → its global placement ids),
 * `objectOfPlacement` the forward read (global placement → dense object index).
 *
 * viewer-webgpu used to hand this whole shape out of `Renderer.getModelMaps`;
 * since 2026.8.31 the host rebuilds it from the `viewer:loadArtifactComplete`
 * realization semantics (see `viewer3/modelMaps.ts`). The forward direction is
 * a call rather than the old `placementObjectIdx: Uint32Array` because the
 * host no longer holds a global, all-models placement array to index into —
 * only per-model lanes plus each model's live placement base.
 */
export interface ViewerModelMaps {
  objectCsr: {
    offsets: Uint32Array
    placements: Uint32Array
    objectCount: number
  }
  /** Undefined when the placement isn't this model's, or resolves to no object. */
  objectOfPlacement(placementIndex: number): number | undefined
}

/**
 * The renderer capabilities this layer consumes — the exact seven calls, no
 * more. `@speckle/viewer-webgpu`'s `Renderer` satisfies it structurally;
 * declaring the seam here (instead of importing the viewer's types) keeps the
 * layer testable with a fake, indifferent to upstream type-resolution quirks,
 * and safe against bundlers materialising two copies of the viewer package
 * (no class identity is ever checked).
 *
 * Members use method syntax on purpose: method parameters check bivariantly,
 * so the viewer's event-map-generic `on` satisfies the loosely-typed one here.
 */
export interface ViewerHandle {
  /** Subscribe to a viewer event; returns the unsubscribe function. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (payload: any) => void): () => void
  /** Placement↔object maps of a loaded model; null when not (or no longer) loaded. */
  getModelMaps(modelId: string): ViewerModelMaps | null
  /** Tint placements with a packed `0xRRGGBBAA` colour. */
  setColor(placements: ArrayLike<number>, rgba: number): void
  /** Restore placements' authored materials (one batched call, like setColor). */
  resetMaterials(placements: ArrayLike<number>): void
  hideObjects(indices: number[]): void
  showObjects(indices: number[]): void
  /** Request a frame (the viewer renders on demand). */
  requestRender(): void
}

/** A single scene object: its model and dense object index within that model. */
export interface ObjectRef {
  modelId: string
  objectIndex: number
}

/** A held keyboard modifier, as read off the pick-initiating pointer-down. */
export type SelectionModifier = 'shift' | 'ctrl' | 'meta' | 'alt'

/**
 * One model's worth of objects — the unit every bulk command speaks. A
 * multi-model command is an array of groups; a single-model call site passes
 * one.
 */
export interface ObjectGroup {
  modelId: string
  objectIndexes: number[]
}

/**
 * Immutable view of interaction state; a fresh object is published on every
 * change. `hidden`/`isolatedTo` expose the RAW per-model index sets on
 * purpose — every containment-style consumer feature ("is my set isolated?")
 * is a pure derivation over them, never a new API.
 */
export interface InteractionsSnapshot {
  /** Selected objects, in selection order (multi-select via modifiers). */
  selection: ObjectRef[]
  /** Explicitly hidden object indexes per model. */
  hidden: ReadonlyMap<string, ReadonlySet<number>>
  /**
   * The per-model object sets the view is isolated to, null when not
   * isolated. Effective visibility is `isolatedTo ∖ hidden` when isolated,
   * `everything ∖ hidden` otherwise.
   */
  isolatedTo: ReadonlyMap<string, ReadonlySet<number>> | null
  /**
   * Objects passing the active filter, per model — the non-undoable filter
   * channel. `null` = no filter. Non-null = objects absent from it are
   * filter-hidden (a non-null empty map hides everything). Composes with the
   * manual state: effectively visible = passes filter AND passes
   * hidden/isolatedTo. Not part of undo history; `showAll` does not clear it.
   */
  filteredTo: ReadonlyMap<string, ReadonlySet<number>> | null
  /**
   * The colour channel: per model, object index → packed `0xRRGGBBAA` tint.
   * `null` = no colours. Painted as an overlay on effectively-visible objects
   * (the selection highlight wins on selected ones). Not part of undo
   * history; `showAll` does not clear it — only `setColors(null)` does.
   */
  colors: ReadonlyMap<string, ReadonlyMap<number, number>> | null
  canUndo: boolean
  canRedo: boolean
  /** True while a viewer command is executing (commands run one at a time). */
  busy: boolean
}

export interface ViewerInteractionsOptions {
  /**
   * The renderer instance this layer drives and self-wires to — the only
   * viewer coupling the layer has. See {@link ViewerHandle}.
   */
  renderer: ViewerHandle
  /**
   * Undo depth. When the command log exceeds it, the log is cleared (a
   * checkpoint keeps the reachable states correct) — visibility undo is a
   * convenience, not an editing-app guarantee.
   */
  historyCap?: number
  /**
   * Selection highlight colour, packed `0xRRGGBBAA`. Selected objects are
   * tinted in the viewport while effectively visible. Defaults to blue.
   */
  selectionColor?: number
  /**
   * Console-log every command entering the layer (with its object index
   * sets, including commands swallowed by no-op guards) and every paint call
   * issued to the renderer. Diagnostic aid — off by default.
   */
  debug?: boolean
}

export interface ViewerInteractions {
  getSnapshot(): InteractionsSnapshot
  /** Invoked once per published change. Returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void

  // ── visibility commands — each call is one undo step ──────────────────────
  /** Hide objects (additive with previous hides). */
  hide(groups: ObjectGroup[]): void
  /** Un-hide objects (the inverse of {@link hide}). */
  show(groups: ObjectGroup[]): void
  /**
   * Isolate the view to these objects. Additive with an active isolation, and
   * clears explicit hides (isolating expresses fresh intent about what is
   * visible).
   */
  isolate(groups: ObjectGroup[]): void
  /** Remove objects from the isolation set; an emptied set ends isolation. */
  unisolate(groups: ObjectGroup[]): void
  /**
   * Replace the isolation wholesale: the view becomes isolated to exactly
   * these objects (explicit hides clear; an empty array ends isolation).
   * One command and one repaint — prefer this over a showAll+isolate pair
   * when expressing a complete new isolation.
   */
  setIsolation(groups: ObjectGroup[]): void
  /**
   * Toggle isolation: when every object is already inside the active
   * isolation this unisolates the groups, otherwise it isolates them — the
   * behavior a click-again-to-undo isolate button wants. The containment
   * read is the exported `isIsolated` helper.
   */
  toggleIsolated(groups: ObjectGroup[]): void
  /** Toggle hidden: fully hidden groups are shown, anything else is hidden. */
  toggleHidden(groups: ObjectGroup[]): void
  /**
   * Clear all hides and any isolation. Undoable like any other command.
   * Leaves the filter channel untouched — clearing the filter is
   * `setFilter(null)`, owned by whoever set it.
   */
  showAll(): void
  undo(): void
  redo(): void

  // ── filter channel — declarative, replace-semantics, NOT undoable ──────────
  /**
   * Declare the current filter result set: these groups ARE the set (replace,
   * not additive). `null` clears the filter; an empty array (or groups with
   * no indexes) is an active filter matching nothing — everything hides.
   * Never creates an undo step, and undo/redo never alters it. Repeated calls
   * with an equal set are no-ops (callers may invoke on every debounced edit).
   */
  setFilter(groups: ObjectGroup[] | null): void

  // ── colour channel — declarative, replace-semantics, NOT undoable ──────────
  /**
   * Declare object tints (validation status colours, colour-by-property,
   * agent-driven colouring): these groups ARE the colour state (replace, not
   * additive; later groups win on overlap). `color` is packed `0xRRGGBBAA`.
   * `null` clears all tints. Tints only ever paint effectively-visible
   * objects and survive every visibility change; a selected object shows the
   * selection highlight instead, reverting to its tint on deselect. Never
   * creates an undo step; repeated calls with an equal assignment are no-ops.
   */
  setColors(
    groups: Array<{ modelId: string; objectIndexes: number[]; color: number }> | null
  ): void

  // ── selection — ephemeral UI focus, never part of undo history ────────────
  /**
   * Programmatic selection (scene-tree rows etc.). Replaces the selection;
   * `additive: true` toggles the refs into/out of it instead — the same
   * policy a modifier-click applies.
   */
  select(refs: ObjectRef[], opts?: { additive?: boolean }): void
  clearSelection(): void
  /**
   * Close (or reopen) the pointer→selection input route. While suspended,
   * clicks neither select nor clear-select — selection STATE is untouched.
   * The tools facade suspends picking while a tool is active (clicks mean
   * the tool, not selection); programmatic `select`/`clearSelection` keep
   * working regardless.
   */
  setPickingSuspended(suspended: boolean): void
  /**
   * Which held modifiers turn a pick into additive (toggle) selection.
   * Default: shift, ctrl and meta all do. The `viewer.input` profile's
   * `additiveSelect` lane drives this.
   */
  setAdditiveModifiers(modifiers: SelectionModifier[]): void

  // ── model-grain reads (off the renderer's own maps, no data plane) ─────────
  /**
   * Every object of one loaded model as a single group — the bridge from
   * model-grain UI verbs ("isolate this model") to the object-grain commands.
   * Null when the model isn't (or is no longer) loaded.
   */
  allObjectsOf(modelId: string): ObjectGroup | null
  /**
   * The object count of one loaded model (0 when not loaded) — pairs with the
   * O(1) model containment reads (`modelIsolationContainment` etc.).
   */
  objectCountOf(modelId: string): number

  /** Unsubscribe from viewer events and drop all listeners. */
  dispose(): void
}
