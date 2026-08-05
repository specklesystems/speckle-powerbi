// Vendored from @speckle/ts-sdk (packages/ts-sdk/src/viewer/objects/interactions.ts, speckle-server-internal@speckle/next).
// @speckle/ts-sdk is private/unpublished; keep this copy in sync until it ships.
/**
 * The interactions layer: one stateful owner of selection + visibility for a
 * WebGPU viewer renderer instance, self-wired to its events, consumed through
 * commands and an immutable snapshot (see types.ts for the contract and the
 * policy).
 *
 * Undo/redo is recompute-based: a bounded command log plus a checkpoint state;
 * undo re-reduces the retained log from the checkpoint and slams the full
 * effective visibility (visibility state is small and repaintable — no
 * baselines-with-folding, no diff reconstruction, no inverse operations).
 * When the log exceeds the cap it is cleared and the checkpoint advances to
 * the current state: deep undo simply stops being available, it is never
 * wrong.
 *
 * Commands execute one at a time. Everything is synchronous today, so a
 * command's effects (state, paint, publish) are visible before the call
 * returns; if an execution is ever in flight (future async viewer ops),
 * later commands queue behind it and `snapshot.busy` reports the wait.
 */
import type {
  InteractionsSnapshot,
  ObjectGroup,
  ObjectRef,
  SelectionModifier,
  ViewerHandle,
  ViewerInteractions,
  ViewerInteractionsOptions
} from './types.js'
import {
  colorGroupsToMap,
  colorsEqual,
  groupsToSets,
  initialState,
  reduce,
  setsContainGroups,
  setsEqual,
  statesEqual,
  type ModelObjectColors,
  type ModelObjectSets,
  type VisibilityCommand,
  type VisibilityState,
  type VisibilityView
} from './state.js'
import {
  allObjectsOf,
  objectCountOf,
  paintEffectiveState,
  paintFilterDelta,
  paintGroups,
  paintOverlaysDiff,
  type PaintedOverlays
} from './paint.js'

const DEFAULT_HISTORY_CAP = 50
/** Default selection highlight: blue, fully opaque. */
const DEFAULT_SELECTION_COLOR = 0x3b82f6ff

const refKey = (ref: ObjectRef): string => `${ref.modelId}:${ref.objectIndex}`

/** Per-model index summary for debug logs: counts up front, full sets attached. */
const describeGroups = (
  groups: ObjectGroup[]
): Array<{ modelId: string; count: number; objectIndexes: number[] }> =>
  groups.map((group) => ({
    modelId: group.modelId,
    count: group.objectIndexes.length,
    objectIndexes: group.objectIndexes
  }))

/** Wrap a handle so every paint call the layer issues is console-logged. */
const withDebugLogging = (renderer: ViewerHandle): ViewerHandle => {
  /** Time the JS-side cost of one renderer call (buffer writes + dirty marking; the GPU upload happens later in the frame). */
  const timed = (label: string, run: () => void): void => {
    const startedAt = globalThis.performance.now()
    run()
    globalThis.console.info(
      `[interactions → viewer] ${label} in ${(globalThis.performance.now() - startedAt).toFixed(1)}ms`
    )
  }
  return {
    on: (event, handler) => renderer.on(event, handler),
    getModelMaps: (modelId) => renderer.getModelMaps(modelId),
    setColor: (placements, rgba): void =>
      timed(
        `setColor ${placements.length} placements 0x${(rgba >>> 0).toString(16)}`,
        () => renderer.setColor(placements, rgba)
      ),
    resetMaterials: (placements): void =>
      timed(`resetMaterials ${placements.length} placements`, () =>
        renderer.resetMaterials(placements)
      ),
    hideObjects: (indices): void =>
      timed(`hideObjects ${indices.length} placements`, () =>
        renderer.hideObjects(indices)
      ),
    showObjects: (indices): void =>
      timed(`showObjects ${indices.length} placements`, () =>
        renderer.showObjects(indices)
      ),
    requestRender: (): void => {
      globalThis.console.info('[interactions → viewer] requestRender')
      renderer.requestRender()
    }
  }
}

export const createViewerInteractions = (
  options: ViewerInteractionsOptions
): ViewerInteractions => {
  const debug = options.debug ?? false
  const renderer = debug ? withDebugLogging(options.renderer) : options.renderer
  const historyCap = options.historyCap ?? DEFAULT_HISTORY_CAP
  const selectionColor = options.selectionColor ?? DEFAULT_SELECTION_COLOR

  const logCommand = (label: string, payload?: unknown): void => {
    if (!debug) return
    if (payload === undefined) globalThis.console.info(`[interactions] ${label}`)
    else globalThis.console.info(`[interactions] ${label}`, payload)
  }

  // ── state ───────────────────────────────────────────────────────────────
  let visibility = initialState()
  // The filter channel lives BESIDE the reducer state, never inside it: it
  // does not enter the command log or the checkpoint, so setFilter can never
  // create an undo step and undo/redo recompute can never clobber it.
  let filter: ModelObjectSets | null = null
  // The colour channel: declarative object tints (status colours etc.),
  // beside the reducer for the same reasons as the filter — not undoable,
  // untouched by showAll, cleared only by setColors(null).
  let colors: ModelObjectColors | null = null
  let selection: ObjectRef[] = []
  // Object→colour currently painted as overlays (colour channel + selection
  // tint), per model. Consulted only by diff flushes (a fused slam is its own
  // reset); rebuilt from what each flush actually painted.
  let paintedOverlays: PaintedOverlays = new Map()

  // Undo/redo: checkpoint + bounded command log + cursor. log[0..cursor) is
  // the undoable past, log[cursor..] the redoable future. Any retained state
  // is exactly `checkpoint re-reduced through log[0..n)`.
  let checkpoint = initialState()
  let log: VisibilityCommand[] = []
  let cursor = 0

  // Models currently loaded in the viewer, maintained from its own events —
  // the roster full repaints and isolate complements operate over.
  const models = new Set<string>()

  const subscribers = new Set<() => void>()
  let running = 0

  let snapshot: InteractionsSnapshot = buildSnapshot()

  function buildSnapshot(): InteractionsSnapshot {
    return {
      selection: [...selection],
      hidden: visibility.hidden,
      isolatedTo: visibility.isolatedTo,
      filteredTo: filter,
      colors,
      canUndo: cursor > 0,
      canRedo: cursor < log.length,
      busy: running > 0
    }
  }

  /** The composed two-channel view every paint evaluates. */
  const view = (): VisibilityView => ({ manual: visibility, filter })

  /**
   * The models a full repaint must touch: the event-maintained roster PLUS
   * every model key appearing in the given states and the filter/colour
   * channels. The union makes paint correctness independent of event
   * delivery — a command always knows which models it touches, and
   * getModelMaps skips ids that aren't actually loaded — while the roster
   * still covers models with no interaction state at all (showAll must
   * repaint those too).
   */
  const paintTargets = (...states: Array<VisibilityState | null>): Set<string> => {
    const out = new Set(models)
    for (const state of states) {
      if (!state) continue
      for (const modelId of state.hidden.keys()) out.add(modelId)
      if (state.isolatedTo) {
        for (const modelId of state.isolatedTo.keys()) out.add(modelId)
      }
    }
    if (filter) for (const modelId of filter.keys()) out.add(modelId)
    if (colors) for (const modelId of colors.keys()) out.add(modelId)
    return out
  }

  const publish = (): void => {
    snapshot = buildSnapshot()
    for (const onChange of [...subscribers]) onChange()
  }

  // ── command execution (serialized; sync fast-path) ──────────────────────
  let chain: Promise<void> = Promise.resolve()

  const enqueue = (work: () => void): void => {
    if (running === 0) {
      // Fast path: nothing in flight, execute synchronously so effects are
      // visible before the command call returns.
      running++
      try {
        work()
      } finally {
        running--
      }
      return
    }
    // An execution is in flight (only possible once viewer ops are async):
    // queue behind it and surface the wait.
    running++
    publish()
    chain = chain.then(() => {
      try {
        work()
      } finally {
        running--
      }
    })
  }

  const replay = (upTo: number): VisibilityState => {
    let state = checkpoint
    for (let i = 0; i < upTo; i++) state = reduce(state, log[i])
    return state
  }

  // ── paint scheduler: one paint per gesture ─────────────────────────────
  //
  // Commands only mutate state and file a paint request; the first request
  // of a JS task schedules a microtask flush. Everything landing in the same
  // task — a colour set plus an isolation, an undo, a filter edit — paints
  // ONCE, from final state. Snapshots still publish synchronously per
  // command; only the paint defers (the renderer draws asynchronously
  // anyway).
  type PaintRequest =
    | {
        kind: 'visibility'
        command: VisibilityCommand
        prev: VisibilityState
        next: VisibilityState
      }
    | { kind: 'filter'; prev: ModelObjectSets | null; next: ModelObjectSets | null }
    | { kind: 'overlays' } // colour channel or selection changed
    | { kind: 'history'; prev: VisibilityState }

  let pendingPaints: PaintRequest[] = []
  let schedulerDisposed = false

  const requestPaint = (request: PaintRequest): void => {
    if (pendingPaints.length === 0) queueMicrotask(flushPaints)
    pendingPaints.push(request)
  }

  /** Whether a lone request is cheap to paint as a forward delta. */
  const isDeltaPaintable = (request: PaintRequest): boolean => {
    switch (request.kind) {
      case 'visibility':
        return request.command.type === 'hide' || request.command.type === 'show'
      case 'filter':
        // Set→set edit only; mode flips touch the whole complement anyway.
        return request.prev !== null && request.next !== null
      case 'overlays':
        return true
      case 'history':
        return false
    }
  }

  const flushPaints = (): void => {
    if (schedulerDisposed || pendingPaints.length === 0) return
    const batch = pendingPaints
    pendingPaints = []
    const startedAt = globalThis.performance.now()

    if (batch.length === 1 && isDeltaPaintable(batch[0])) {
      paintDelta(batch[0])
    } else {
      // Composite flush (or a slam-only command): one fused paint of the
      // final state. Targets = roster ∪ every model key in any painted
      // state, past or present — paint correctness must not depend on the
      // roster events arriving.
      const targets = paintTargets(
        visibility,
        ...batch.flatMap((request) =>
          request.kind === 'visibility'
            ? [request.prev, request.next]
            : request.kind === 'history'
              ? [request.prev]
              : []
        )
      )
      for (const request of batch) {
        if (request.kind !== 'filter') continue
        for (const set of [request.prev, request.next]) {
          if (set) for (const modelId of set.keys()) targets.add(modelId)
        }
      }
      for (const modelId of paintedOverlays.keys()) targets.add(modelId)
      paintedOverlays = paintEffectiveState({
        renderer,
        view: view(),
        selection,
        colors,
        previous: paintedOverlays,
        selectionColor,
        targets
      })
    }

    if (debug) {
      logCommand(
        `flush → ${
          batch.length === 1 && isDeltaPaintable(batch[0]) ? 'delta' : 'fused'
        } paint (${batch.map((request) => request.kind).join(' + ')}) in ${(
          globalThis.performance.now() - startedAt
        ).toFixed(1)}ms`
      )
    }
  }

  /** Forward-delta paint for a lone small change — see isDeltaPaintable. */
  const paintDelta = (request: PaintRequest): void => {
    if (request.kind === 'visibility' && request.command.type === 'hide') {
      // Only the newly hidden indexes; hiding an already-invisible object
      // (e.g. outside an active isolation) is a harmless no-op paint. The
      // painted map is NOT consulted here — entries for now-hidden objects
      // self-heal on the next overlay diff (their reset pass skips
      // invisible objects and the map is rebuilt from desired∩visible).
      const delta: ObjectGroup[] = request.command.groups.map((group) => ({
        modelId: group.modelId,
        objectIndexes: group.objectIndexes.filter(
          (objectIndex) => !request.prev.hidden.get(group.modelId)?.has(objectIndex)
        )
      }))
      paintGroups(renderer, delta, false)
      return
    }
    if (request.kind === 'visibility' && request.command.type === 'show') {
      // Only the newly un-hidden indexes that are EFFECTIVELY visible: under
      // an active isolation or filter, an object outside those allow-sets
      // stays invisible even once its explicit hide is removed. The overlay
      // diff after re-tints any of them that carry a colour.
      const { next } = request
      const delta: ObjectGroup[] = request.command.groups.map((group) => ({
        modelId: group.modelId,
        objectIndexes: group.objectIndexes.filter(
          (objectIndex) =>
            request.prev.hidden.get(group.modelId)?.has(objectIndex) &&
            (next.isolatedTo === null ||
              next.isolatedTo.get(group.modelId)?.has(objectIndex) === true) &&
            (filter === null || filter.get(group.modelId)?.has(objectIndex) === true)
        )
      }))
      paintGroups(renderer, delta, true)
      paintedOverlays = paintOverlaysDiff({
        renderer,
        previous: paintedOverlays,
        selection,
        colors,
        view: view(),
        selectionColor
      })
      return
    }
    if (request.kind === 'filter' && request.prev && request.next) {
      // Set→set edit — the hot path while a filter stack is being tweaked:
      // paint only the symmetric difference, then re-tint entering objects.
      paintFilterDelta({
        renderer,
        previous: request.prev,
        next: request.next,
        manual: visibility
      })
      paintedOverlays = paintOverlaysDiff({
        renderer,
        previous: paintedOverlays,
        selection,
        colors,
        view: view(),
        selectionColor
      })
      return
    }
    // overlays (colour/selection change, no visibility change): pure diff.
    paintedOverlays = paintOverlaysDiff({
      renderer,
      previous: paintedOverlays,
      selection,
      colors,
      view: view(),
      selectionColor
    })
  }

  const apply = (command: VisibilityCommand): void => {
    enqueue(() => {
      logCommand(
        command.type,
        'groups' in command ? describeGroups(command.groups) : undefined
      )
      const prev = visibility
      const next = reduce(prev, command)
      // No-op guard: unchanged-by-value commands never paint, publish, or
      // enter history (an undo that "does nothing" reads as broken).
      if (statesEqual(prev, next)) {
        logCommand(`${command.type} → no-op (state unchanged), nothing painted`)
        return
      }

      // Record: truncate any redo tail, clear on overflow (the checkpoint
      // advances so retained states stay exactly reproducible).
      if (cursor < log.length) log.length = cursor
      if (log.length >= historyCap) {
        checkpoint = prev
        log = []
        cursor = 0
      }
      log.push(command)
      cursor++

      visibility = next
      requestPaint({ kind: 'visibility', command, prev, next })
      publish()
    })
  }

  const moveTo = (nextCursor: number): void => {
    enqueue(() => {
      logCommand(`undo/redo → history cursor ${nextCursor}, full repaint`)
      const prev = visibility
      cursor = nextCursor
      visibility = replay(cursor)
      requestPaint({ kind: 'history', prev })
      publish()
    })
  }

  // ── filter channel (declarative, replace-semantics, not undoable) ─────────
  const setFilter = (groups: ObjectGroup[] | null): void => {
    enqueue(() => {
      logCommand('setFilter', groups === null ? null : describeGroups(groups))
      const next = groups === null ? null : groupsToSets(groups)
      // No-op guard: identical filter sets never paint or publish (the panel
      // calls this repeatedly, debounced upstream).
      if (filter === null && next === null) return
      if (filter !== null && next !== null && setsEqual(filter, next)) {
        logCommand('setFilter → no-op (set unchanged), nothing painted')
        return
      }

      const prev = filter
      filter = next
      requestPaint({ kind: 'filter', prev, next })
      publish()
    })
  }

  // ── colour channel (declarative, replace-semantics, not undoable) ─────────
  const setColors = (groups: Parameters<ViewerInteractions['setColors']>[0]): void => {
    enqueue(() => {
      logCommand(
        'setColors',
        groups === null
          ? null
          : groups.map((group) => ({
              modelId: group.modelId,
              color: `0x${(group.color >>> 0).toString(16)}`,
              count: group.objectIndexes.length,
              objectIndexes: group.objectIndexes
            }))
      )
      const next = groups === null ? null : colorGroupsToMap(groups)
      // No-op guard: identical colour assignments never paint or publish.
      if (colors === null && next === null) return
      if (colors !== null && next !== null && colorsEqual(colors, next)) {
        logCommand('setColors → no-op (colours unchanged), nothing painted')
        return
      }

      colors = next
      requestPaint({ kind: 'overlays' })
      publish()
    })
  }

  // ── selection ───────────────────────────────────────────────────────────
  const setSelection = (next: ObjectRef[]): void => {
    logCommand('selection', next.map(refKey))
    selection = next
    requestPaint({ kind: 'overlays' })
    publish()
  }

  const toggleIntoSelection = (refs: ObjectRef[]): void => {
    const keys = new Set(selection.map(refKey))
    let next = [...selection]
    for (const ref of refs) {
      const key = refKey(ref)
      if (keys.has(key)) {
        next = next.filter((existing) => refKey(existing) !== key)
        keys.delete(key)
      } else {
        next.push(ref)
        keys.add(key)
      }
    }
    setSelection(next)
  }

  const replaceSelection = (refs: ObjectRef[]): void => {
    const seen = new Set<string>()
    setSelection(
      refs.filter((ref) => {
        const key = refKey(ref)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    )
  }

  // ── viewer wiring ───────────────────────────────────────────────────────

  // The pick event carries no keyboard modifiers, but the viewer re-emits its
  // raw pointer events — the additive-selection modifier is read off the
  // pointer-down that initiates the picking click, so it is per-click and
  // needs no window focus or global key listeners. Which modifiers count is
  // profile-driven (`setAdditiveModifiers`). Wishlist: modifiers on the pick
  // event itself.
  let modifierHeld = false
  let additiveModifiers = new Set<SelectionModifier>(['shift', 'ctrl', 'meta'])
  // Tool arbitration: while a tool is active the facade closes this route —
  // clicks mean the tool. State (and programmatic selection) are untouched.
  let pickingSuspended = false

  // Callback params are annotated structurally — the handle's `on` is loosely
  // typed on purpose (see ViewerHandle), so each listener declares the payload
  // shape it consumes.
  const unsubscribers: Array<() => void> = [
    renderer.on(
      'input:pointer-down',
      (e: {
        shiftKey: boolean
        ctrlKey: boolean
        metaKey: boolean
        altKey?: boolean
      }) => {
        modifierHeld =
          (additiveModifiers.has('shift') && e.shiftKey) ||
          (additiveModifiers.has('ctrl') && e.ctrlKey) ||
          (additiveModifiers.has('meta') && e.metaKey) ||
          (additiveModifiers.has('alt') && (e.altKey ?? false))
      }
    ),
    renderer.on(
      'viewer:loadArtifactComplete',
      ({ artifactId }: { artifactId: string }) => {
        logCommand(`model registered: ${artifactId}`)
        models.add(artifactId)
      }
    ),
    renderer.on(
      'viewer:unloadArtifactComplete',
      ({ artifactId }: { artifactId: string | null }) => {
        logCommand(`model unregistered: ${artifactId ?? 'ALL (scene unloaded)'}`)
        // Null artifact id = the scene unloaded wholesale.
        if (artifactId === null) models.clear()
        else models.delete(artifactId)
      }
    ),
    // KNOWN GAP — streamed geometry resurrects hidden placements: the
    // renderer's setVisibleAt only pokes the transient per-placement material
    // buffer, and chunk (re)ingest — progressive load, residency
    // eviction/reload — rewrites that buffer from authored defaults. Colours
    // survive (they ride the persistent placementColors side-table the ingest
    // consults); VISIBILITY has no such table, so isolation/hides can rot
    // away while geometry streams. Needs the upstream fix
    // (TODO(upstream viewer-webgpu): persistent hiding, same mechanism as
    // placementColors — the renderer's own setVisibleAt comment already calls
    // the current behavior temporary). A layer-side re-assert loop was tried
    // and reverted: re-slamming on geometry-stream ticks fought the streamer
    // and broke visibility state even on clean loads.
    renderer.on(
      'viewer:placementsPicked',
      ({
        modelId,
        pickResult
      }: {
        modelId: string
        pickResult: { placementIndex: number } | null
      }) => {
        if (pickingSuspended) return
        // Pick miss: a plain click clears the selection, a modified click is
        // a no-op (mis-aiming during multi-select must not wipe the set).
        if (!modelId || !pickResult) {
          if (!modifierHeld && selection.length) setSelection([])
          return
        }
        const maps = renderer.getModelMaps(modelId)
        if (!maps) return
        const objectIndex = maps.placementObjectIdx[pickResult.placementIndex]
        if (objectIndex === undefined) return
        const ref: ObjectRef = { modelId, objectIndex }
        if (modifierHeld) toggleIntoSelection([ref])
        else replaceSelection([ref])
      }
    )
  ]

  return {
    getSnapshot: () => snapshot,
    subscribe: (onChange) => {
      subscribers.add(onChange)
      return () => subscribers.delete(onChange)
    },

    hide: (groups) => apply({ type: 'hide', groups }),
    show: (groups) => apply({ type: 'show', groups }),
    isolate: (groups) => apply({ type: 'isolate', groups }),
    unisolate: (groups) => apply({ type: 'unisolate', groups }),
    setIsolation: (groups) => apply({ type: 'setIsolation', groups }),
    // Toggles pick their direction from the live state at call time (commands
    // execute synchronously and serialized, so the read can't go stale).
    toggleIsolated: (groups) =>
      apply(
        setsContainGroups(visibility.isolatedTo, groups)
          ? { type: 'unisolate', groups }
          : { type: 'isolate', groups }
      ),
    toggleHidden: (groups) =>
      apply(
        setsContainGroups(visibility.hidden, groups)
          ? { type: 'show', groups }
          : { type: 'hide', groups }
      ),
    showAll: () => apply({ type: 'showAll' }),

    setFilter,
    setColors,

    undo: (): void => {
      if (cursor > 0) moveTo(cursor - 1)
    },
    redo: (): void => {
      if (cursor < log.length) moveTo(cursor + 1)
    },

    select: (refs, opts): void => {
      if (opts?.additive) toggleIntoSelection(refs)
      else replaceSelection(refs)
    },
    clearSelection: (): void => {
      if (selection.length) setSelection([])
    },
    setPickingSuspended: (suspended): void => {
      pickingSuspended = suspended
    },
    setAdditiveModifiers: (modifiers): void => {
      additiveModifiers = new Set(modifiers)
    },

    allObjectsOf: (modelId) => allObjectsOf(renderer, modelId),
    objectCountOf: (modelId) => objectCountOf(renderer, modelId),

    dispose: (): void => {
      schedulerDisposed = true
      pendingPaints = []
      for (const unsubscribe of unsubscribers) unsubscribe()
      unsubscribers.length = 0
      subscribers.clear()
    }
  }
}
