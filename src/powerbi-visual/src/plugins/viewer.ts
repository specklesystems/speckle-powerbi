/**
 * ViewerHandler — the visual's one viewer-facing seam, rewritten onto viewer 3
 * (@speckle/viewer-webgpu) and its remote geometry stream (ADR-0014).
 *
 * Load path: fetch the version's /artifacts payload → the server advertises its
 * geometry-stream WebSocket endpoint → `loadRemoteBundleDat` allocates the scene's typed
 * arrays from the `.viewer.idx` artifact (fetched in parallel with the WS handshake) and
 * streams geometry waves as ranged reads over the socket. Nothing touches OPFS/duckdb —
 * the exact host this path was built for (opaque-origin sandboxed iframes).
 *
 * Identity: Power BI rows speak the connector's Object Key (canonical, resolved by pure
 * arithmetic) or applicationId (compatibility); the renderer + interactions layer speak
 * (modelId = versionId, dense objectIndex). In Application ID mode the bridge is the
 * per-version objects dictionary read from `{versionId}.eav.objects.parquet` (see
 * objectsDictionary); in Object Key mode no dictionary is needed.
 *
 * The emitter surface (IViewerEvents) is unchanged so visualStore / ViewerWrapper /
 * ViewerControls keep working untouched.
 */
import type { Renderer } from '@speckle/viewer-webgpu'
import { createRendererBridge, type RendererBridge } from '@src/viewer3/bridge'
import { createViewerInteractions } from '@src/viewer3/objects/index'
import type { ObjectGroup, ObjectRef, ViewerInteractions } from '@src/viewer3/objects/types'
import {
  bootRenderer,
  setCanonicalView,
  zoomToObjects,
  cameraStateOf,
  type CanonicalView
} from '@src/viewer3/boot'
import {
  buildArtifactsUrl,
  fetchArtifactsPayload,
  type ArtifactFile
} from '@src/viewer3/artifacts'
import { loadRemoteOnly } from '@src/viewer3/remoteGeometry'
import {
  loadObjectsDictionary,
  type ObjectsDictionary
} from '@src/viewer3/objectsDictionary'
import {
  classifyIdentityMode,
  describeObjectKeyIssues,
  KEY_SPACE,
  validateObjectKeys,
  type IdMode
} from '@src/utils/objectIdentity'
import type { LoadProgress } from '@src/viewer3/loadProgress'
import { useVisualStore } from '@src/store/visualStore'
import { DecodedModelInfo } from '@src/utils/decodeUserInfo'
import { Tracker } from '@src/utils/mixpanel'
import { createNanoEvents, Emitter } from 'nanoevents'

/** How much of the geometry the renderer keeps resident (viewer-3 out-of-core budget). */
const RESIDENCY_FRACTION = 0.75

/** Must match visual.ts FETCH_FILTERED_MAX_ROWS — an id list at this size means even
 *  the fetchMoreData paging budget was exhausted (pathologically large filter result). */
const DATAVIEW_ROW_CAP = 1000000

export interface Hit {
  guid: string
  object?: Record<string, unknown>
  point: { x: number; y: number; z: number }
}

/** Kept for API compatibility with the v2 handler (ViewerControls passes these through). */
export interface ViewModeOptions {
  edges?: boolean
  outlineThickness?: number
  outlineOpacity?: number
  outlineColor?: number
}

export interface IViewerEvents {
  ping: (message: string) => void
  resize: () => void
  setSelection: (objectIds: string[]) => void
  resetFilter: (objectIds: string[], ghost: boolean, zoom: boolean) => void
  filterSelection: (objectIds: string[], ghost: boolean, zoom: boolean) => void
  setViewMode: (viewMode: number, options?: ViewModeOptions) => void
  setIdMode: (mode: IdMode | null) => void
  colorObjectsByGroup: (
    colorById: {
      objectIds: string[]
      color: string
    }[]
  ) => void
  isolateObjects: (objectIds: string[]) => void
  unIsolateObjects: () => void
  zoomExtends: () => void
  toggleProjection: () => void
  toggleGhostHidden: (ghost: boolean) => void
  toggleSectionBox: (enabled: boolean) => void
  setSectionBoxVisible: (visible: boolean) => void
  loadModels: (models: DecodedModelInfo[]) => void
  objectsLoaded: () => void
  objectClicked: (hit: Hit | null, isMultiSelect: boolean, mouseEvent?: PointerEvent) => void
}

export type ColorBy = {
  objectIds: string[]
  color: string
}

/** '#RRGGBB' / '#RGB' → packed 0xRRGGBBAA (opaque). */
const hexToRgba = (hex: string): number => {
  let h = hex.replace('#', '')
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  const rgb = parseInt(h.slice(0, 6), 16)
  return ((rgb << 8) | 0xff) >>> 0
}

export class ViewerHandler {
  public emitter: Emitter
  public renderer: Renderer | null = null
  public interactions: ViewerInteractions | null = null

  /** Compat facade for ViewerWrapper's right-click path (v2 exposed the selection extension). */
  public selection = {
    getSelectedObjects: (): Array<{ id: string }> => {
      if (!this.interactions) return []
      return this.interactions
        .getSnapshot()
        .selection.map((ref) => {
          const id = this.boundIdOf(ref)
          return id ? { id } : null
        })
        .filter((x): x is { id: string } => x !== null)
    }
  }

  private bridge: RendererBridge
  private canvas: HTMLCanvasElement | null = null
  /** renderer model id (`bundle_${versionId}`) → applicationId dictionary. */
  private dictionaries = new Map<string, ObjectsDictionary>()
  /** artifacts payload files per loaded model, so a rebind INTO Application ID
   *  mode can download the dictionary without reloading the model. */
  private artifactFilesByModelId = new Map<string, ArtifactFile[]>()
  private loadedModelIds: string[] = []
  /**
   * Identity mode of the bound id column. 'objectKey': the well carries the
   * connector's dense Object Key (ordinal*2^32 + object_index) — resolution is
   * pure arithmetic, no dictionary download at all. 'applicationId': GUID
   * strings, resolved through the eav.objects.parquet dictionary
   * (compatibility binding). Resolved per data input (metadata-led, see
   * objectIdentity.ts) and carried in via the setIdMode event; 'unknown' only
   * before the first classified input arrives.
   */
  private idMode: 'unknown' | IdMode = 'unknown'
  /** federation ordinal ↔ renderer model id, for Object Key arithmetic. */
  private ordinalToModelId = new Map<number, string>()
  private modelIdToOrdinal = new Map<string, number>()
  private projectionMode: 'perspective' | 'orthographic' = 'perspective'
  /** Last pointerup on the canvas — pick results arrive async, this supplies
   *  the modifier + screen position the PBI side needs. */
  private lastPointerUp: PointerEvent | null = null
  private unsubscribers: Array<() => void> = []
  /** Streaming keep-alive: the renderer only issues geometry read-waves while frames
   *  render, and its on-demand loop goes idle in an untouched report viewport — tick
   *  requestRender while the stream is hot so whale models finish without interaction. */
  private streamKeepAlive: ReturnType<typeof setInterval> | null = null
  private lastStreamActivity = 0
  private streamStatsDecay: ReturnType<typeof setTimeout> | null = null
  /** The renderer's totalMB is a lifetime counter (never resets on unload) — the pill
   *  shows per-load MB by subtracting the baseline captured at each loadModels. */
  private lastStreamTotalMB = 0
  private streamBaselineMB = 0

  constructor() {
    this.emitter = createNanoEvents()
    this.emit = this.emit.bind(this)
    this.emitter.on('ping', this.handlePing)
    this.emitter.on('resize', this.resizeViewer)
    this.emitter.on('filterSelection', this.filterSelection)
    this.emitter.on('resetFilter', this.resetFilter)
    this.emitter.on('setSelection', this.selectObjects)
    this.emitter.on('setViewMode', this.setViewMode)
    this.emitter.on('setIdMode', this.setIdMode)
    this.emitter.on('colorObjectsByGroup', this.colorObjectsByGroup)
    this.emitter.on('isolateObjects', this.isolateObjects)
    this.emitter.on('unIsolateObjects', this.unIsolateObjects)
    this.emitter.on('zoomExtends', this.zoomExtends)
    this.emitter.on('zoomObjects', this.zoomObjects)
    this.emitter.on('loadModels', this.loadModels)
    this.emitter.on('objectsLoaded', this.handleObjectsLoaded)
    this.emitter.on('toggleProjection', this.toggleProjection)
    this.emitter.on('toggleGhostHidden', this.toggleGhostHidden)
    this.emitter.on('toggleSectionBox', this.toggleSectionBox)
    this.emitter.on('setSectionBoxVisible', this.setSectionBoxVisible)
    this.bridge = createRendererBridge()
    // Interactions exist from construction (they no-op until the renderer binds),
    // so subscriptions registered before init still work.
    this.interactions = createViewerInteractions({ renderer: this.bridge.handle })
  }

  async init(parent: HTMLElement) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(navigator as any).gpu) {
      throw new Error(
        'WebGPU is not available in this environment — viewer 3 cannot start. ' +
          '(Power BI sandbox without navigator.gpu, or an unsupported browser.)'
      )
    }
    // The renderer wants a canvas; the host hands us its container div.
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none'
    parent.appendChild(canvas)
    canvas.width = Math.max(1, canvas.clientWidth * devicePixelRatio)
    canvas.height = Math.max(1, canvas.clientHeight * devicePixelRatio)
    this.canvas = canvas

    const renderer = await bootRenderer(canvas, this.bridge.emitter, {
      restrictKeyInput: true
    })
    this.bridge.bind(renderer)
    this.renderer = renderer
    renderer.setTheme('light', true, false)

    const store = useVisualStore()
    if (store.isOrthoProjection) {
      this.projectionMode = 'orthographic'
      renderer.setProjection('orthographic')
    }

    // Double-click on empty space = zoom extents (the renderer zooms to object on hits).
    renderer.onDoubleClickMiss = () => this.zoomExtends()

    // Streaming ticker (~1/s while frames render): pre-paint it enriches the blocking
    // overlay with MB/s; post-paint it drives the small pill (5s decay, like frontend-3).
    this.unsubscribers.push(
      this.bridge.emitter.on('viewer:geomLoadStats', (payload) => {
        const stats = payload as { mbPerSec?: number; inFlight?: number; totalMB?: number }
        const active = (stats?.mbPerSec ?? 0) > 0.5 || (stats?.inFlight ?? 0) > 0
        if (!active) return
        this.lastStreamActivity = Date.now()
        const mbPerSec = stats.mbPerSec ?? 0
        this.lastStreamTotalMB = stats.totalMB ?? this.lastStreamTotalMB
        const totalMB = Math.max(0, this.lastStreamTotalMB - this.streamBaselineMB)
        const progressStore = useVisualStore()
        const extended = stats as { inFlight?: number; primPerSec?: number; avgMbPerSec?: number }
        progressStore.setDiagStats(
          `stream ${totalMB.toFixed(0)} MB (session ${this.lastStreamTotalMB.toFixed(0)}) · ` +
            `${mbPerSec.toFixed(1)} MB/s (avg ${(extended.avgMbPerSec ?? 0).toFixed(1)}) · ` +
            `in-flight ${extended.inFlight ?? 0} · ${Math.round(extended.primPerSec ?? 0)} prim/s`
        )
        if (progressStore.loadingProgress) {
          const rate = mbPerSec >= 0.05 ? ` — ${mbPerSec.toFixed(1)} MB/s` : ''
          progressStore.setLoadingProgress(
            `Streaming geometry (${totalMB.toFixed(0)} MB)${rate}`,
            null
          )
        } else {
          progressStore.setStreamingStats({ mbPerSec, totalMB })
        }
        if (this.streamStatsDecay) clearTimeout(this.streamStatsDecay)
        this.streamStatsDecay = setTimeout(
          () => useVisualStore().setStreamingStats(null),
          5000
        )
      })
    )

    // Click → PBI cross-filter + tooltip. The interactions layer self-wires its own
    // selection to this same pick event; we only translate it for the host.
    canvas.addEventListener('pointerup', this.capturePointerUp, { capture: true })
    this.unsubscribers.push(
      this.bridge.emitter.on('viewer:placementsPicked', (payload) =>
        this.handlePlacementsPicked(
          payload as {
            modelId: string
            pickResult: {
              placementIndex: number
              hitPoint: { x: number; y: number; z: number }
            } | null
          }
        )
      )
    )
    console.log('🎥 Viewer 3 (WebGPU) is created!')
    store.pushDiagEvent('viewer initialized (new renderer, no models yet)')
  }

  emit<E extends keyof IViewerEvents>(event: E, ...payload: Parameters<IViewerEvents[E]>): void {
    this.emitter.emit(event, ...payload)
  }

  // ── id translation ─────────────────────────────────────────────────────────

  /**
   * The resolved identity mode of the current data input, carried with every
   * viewer update (the store emits it before filters/colors). Rebinding the
   * same model/version between Object Key and Application ID switches modes
   * here immediately — the mode is NOT locked to the last model-version load.
   * Switching INTO Application ID mode downloads any missing dictionaries;
   * Object Key mode keeps its no-dictionary fast path.
   */
  public setIdMode = (mode: IdMode | null) => {
    if (mode === null || mode === this.idMode) return
    this.idMode = mode
    const store = useVisualStore()
    store.pushDiagEvent(
      mode === 'objectKey'
        ? 'id mode: Object Key — arithmetic resolution, no dictionary needed'
        : 'id mode: Application ID — dictionary resolution'
    )
    if (mode === 'applicationId') {
      // The filter/color emits accompanying this mode switch resolve against
      // whatever dictionaries exist RIGHT NOW (missing ones fail open) — once
      // the downloads land, replay the current input through the same
      // objectsLoaded lifecycle the model-load path uses.
      void this.ensureDictionaries().then((loadedAny) => {
        if (loadedAny) this.emit('objectsLoaded')
      })
    }
  }

  /** Download dictionaries missing for already-loaded models (a rebind into
   *  Application ID mode after an Object Key load skipped them). Returns
   *  whether any dictionary was newly loaded, so the caller knows a replay of
   *  the current input is needed. */
  private async ensureDictionaries(): Promise<boolean> {
    const store = useVisualStore()
    let loadedAny = false
    for (const rendererModelId of [...this.loadedModelIds]) {
      if (this.dictionaries.has(rendererModelId)) continue
      const files = this.artifactFilesByModelId.get(rendererModelId)
      if (!files) continue
      try {
        const dictionary = await loadObjectsDictionary(files)
        // a version reload may have swapped models while the fetch was in
        // flight — never register a dictionary for an unloaded model
        if (!this.loadedModelIds.includes(rendererModelId)) continue
        this.dictionaries.set(rendererModelId, dictionary)
        loadedAny = true
        store.pushDiagEvent(
          `objects dictionary for ${rendererModelId}: ` +
            `${dictionary.toIndex.size} applicationIds mapped (loaded on mode switch)`
        )
      } catch (err) {
        console.error(`objects dictionary failed for ${rendererModelId} on mode switch`, err)
        store.pushDiagEvent(
          `objects dictionary FAILED for ${rendererModelId} — selection/coloring degraded`
        )
      }
    }
    return loadedAny
  }

  /** ref → the currently bound identity (Object Key text or applicationId). */
  private boundIdOf(ref: ObjectRef): string | null {
    if (this.idMode === 'objectKey') {
      const ordinal = this.modelIdToOrdinal.get(ref.modelId)
      if (ordinal === undefined) return null
      return String(ordinal * KEY_SPACE + ref.objectIndex)
    }
    return this.dictionaries.get(ref.modelId)?.toApplicationId.get(ref.objectIndex) ?? null
  }

  /** bound ids → per-model dense-index groups, across every loaded model. */
  private toGroups(objectIds: string[]): ObjectGroup[] {
    if (this.idMode === 'unknown') {
      // final fallback: no classified input reached us yet (metadata and field
      // identity unusable) — inspect the first value
      const fallback = classifyIdentityMode(null, objectIds[0])
      if (fallback === null) return []
      this.setIdMode(fallback)
    }
    if (this.idMode === 'objectKey') {
      const { byOrdinal, issues } = validateObjectKeys(
        objectIds,
        new Set(this.ordinalToModelId.keys())
      )
      const diagnosis = describeObjectKeyIssues(issues, objectIds.length)
      if (diagnosis) {
        console.warn(`[viewer3] ${diagnosis}`)
        useVisualStore().pushDiagEvent(diagnosis)
      }
      const groups: ObjectGroup[] = []
      for (const [ordinal, objectIndexes] of byOrdinal) {
        const modelId = this.ordinalToModelId.get(ordinal)
        if (modelId) groups.push({ modelId, objectIndexes })
      }
      return groups
    }
    const groups: ObjectGroup[] = []
    for (const [modelId, dict] of this.dictionaries) {
      const objectIndexes: number[] = []
      for (const id of objectIds) {
        const index = dict.toIndex.get(id)
        if (index !== undefined) objectIndexes.push(index)
      }
      if (objectIndexes.length > 0) groups.push({ modelId, objectIndexes })
    }
    return groups
  }

  private toRefs(objectIds: string[]): ObjectRef[] {
    return this.toGroups(objectIds).flatMap((g) =>
      g.objectIndexes.map((objectIndex) => ({ modelId: g.modelId, objectIndex }))
    )
  }

  // ── camera ─────────────────────────────────────────────────────────────────

  public zoomObjects = (objectIds: string[]) => {
    if (!this.renderer) return
    zoomToObjects(this.renderer, this.toGroups(objectIds))
  }

  public zoomExtends = () => {
    if (!this.renderer) return
    zoomToObjects(this.renderer)
  }

  /** The renderer re-measures only on window resize, which the PBI sandbox doesn't
   *  reliably fire — the host forwards its resize updates here. */
  public resizeViewer = () => {
    if (!this.renderer || !this.canvas) return
    this.canvas.width = Math.max(1, this.canvas.clientWidth * devicePixelRatio)
    this.canvas.height = Math.max(1, this.canvas.clientHeight * devicePixelRatio)
    this.renderer.requestResize()
    this.renderer.requestRender()
  }

  public toggleProjection = () => {
    if (!this.renderer) return
    this.projectionMode =
      this.projectionMode === 'perspective' ? 'orthographic' : 'perspective'
    this.renderer.setProjection(this.projectionMode)
  }

  public setView = (view: CanonicalView | { name?: string }) => {
    if (!this.renderer) return
    if (typeof view === 'string') {
      setCanonicalView(this.renderer, view)
      this.snapshotCameraPositionAndStore()
    }
    // SpeckleView objects (named scene views) don't exist on the artifact path.
  }

  public snapshotCameraPositionAndStore = () => {
    if (!this.renderer) return
    const state = cameraStateOf(this.renderer)
    const [px, py, pz] = state.position
    const [tx, ty, tz] = state.target
    const store = useVisualStore()
    store.writeCameraPositionToFile(
      { x: px, y: py, z: pz } as never,
      { x: tx, y: ty, z: tz } as never
    )
  }

  // ── section box: not yet ported to viewer 3 (renderer.setClipPlanes exists; the
  //    interactive gizmo lives in @speckle/viewer-tools' Clipping — follow-up). ────

  public toggleSectionBox = (enabled: boolean) => {
    if (enabled) console.warn('section box is not yet available on the viewer-3 path')
  }

  public setSectionBoxVisible = (_visible: boolean) => {
    /* not yet available on the viewer-3 path */
  }

  public getSectionBoxData = (): string | null => null

  public applySectionBox = (_boxData: string) => {
    /* not yet available on the viewer-3 path */
  }

  public setViewMode = (viewMode: number, _options?: ViewModeOptions) => {
    // v2 view modes (pen/arctic/edges) have no viewer-3 equivalent yet.
    if (viewMode) console.warn('view modes are not yet available on the viewer-3 path')
  }

  // ── selection / visibility / colors (all applicationId-keyed) ──────────────

  public selectObjects = (objectIds: string[] | null) => {
    if (!this.interactions) return
    if (objectIds && objectIds.length > 0) {
      this.interactions.select(this.toRefs(objectIds))
    } else {
      this.interactions.clearSelection()
    }
  }

  /**
   * FAIL-OPEN guard for the filter channel: in the interactions layer an active filter
   * matching NOTHING hides the whole scene. When the host hands us ids but none resolve
   * through the dictionary (dictionary fetch failed, id-space mismatch, or the dictionary
   * hasn't landed yet), applying the resolved-empty filter would blank the model — clear
   * the filter instead and shout the diagnosis.
   */
  private resolveFilterGroups(objectIds: string[], caller: string): ObjectGroup[] | null {
    const startedAt = performance.now()
    const groups = this.toGroups(objectIds)
    const resolved = groups.reduce((n, g) => n + g.objectIndexes.length, 0)
    const store = useVisualStore()
    if (objectIds.length > 0 && resolved === 0) {
      const context =
        this.idMode === 'objectKey'
          ? `ordinals=[${[...this.ordinalToModelId.keys()].join(',')}]`
          : `dictionaries=[${
              [...this.dictionaries.entries()]
                .map(([id, d]) => `${id}:${d.toIndex.size}`)
                .join(', ') || 'NONE LOADED'
            }]`
      const msg =
        `${caller}: 0 of ${objectIds.length} ids resolved (${this.idMode} mode) — ` +
        `failing open (no filter). ${context}`
      console.error(`[viewer3] ${msg} sample ids=${JSON.stringify(objectIds.slice(0, 3))}`)
      store.pushDiagEvent(msg)
      return null
    }
    const msg =
      `${caller}: resolved ${resolved}/${objectIds.length} ids across ` +
      `${groups.length} model(s) in ${(performance.now() - startedAt).toFixed(0)}ms`
    console.log(`[viewer3] ${msg}`)
    store.pushDiagEvent(msg)
    return groups
  }

  /** Wrap a paint-heavy interactions call with a HUD timing line (main-thread cost
   *  of the synchronous visibility repaint — the "freeze" when it is seconds). */
  private timedPaint(label: string, run: () => void) {
    const startedAt = performance.now()
    run()
    const ms = performance.now() - startedAt
    if (ms > 100) useVisualStore().pushDiagEvent(`${label} painted in ${(ms / 1000).toFixed(1)}s`)
  }

  /** PBI cross-filter highlight: the view shows exactly these objects. `ghost` has no
   *  viewer-3 equivalent yet (filtered-out objects hide instead of ghosting). */
  public filterSelection = (objectIds: string[], _ghost: boolean, zoom: boolean = true) => {
    if (!this.interactions || !objectIds) return
    const groups = this.resolveFilterGroups(objectIds, 'filterSelection')
    this.timedPaint('filterSelection', () => this.interactions.setFilter(groups))
    if (zoom) this.zoomObjects(objectIds)
  }

  public resetFilter = (objectIds: string[], _ghost: boolean, zoom: boolean = true) => {
    if (!this.interactions || !objectIds) return
    // Always apply what the data view sent — even when it hit the row cap
    // (truncated big-category filters show a partial-but-visible result; a no-op
    // reads as broken). A true "clear" is the unIsolateObjects event, which the
    // Reset button emits explicitly.
    if (objectIds.length >= DATAVIEW_ROW_CAP) {
      console.warn(
        `[viewer3] resetFilter: id list hit the ${DATAVIEW_ROW_CAP}-row fetch budget — ` +
          'the applied filter is a truncated sample of the real result'
      )
    }
    // Back to "everything the data view contains" — same declarative channel.
    const groups = this.resolveFilterGroups(objectIds, 'resetFilter')
    this.timedPaint('resetFilter', () => this.interactions.setFilter(groups))
    if (zoom) this.zoomObjects(objectIds)
  }

  public colorObjectsByGroup = (colorByIds: ColorBy[]) => {
    if (!this.interactions) return
    if (!colorByIds || colorByIds.length === 0) {
      this.interactions.setColors(null)
      return
    }
    this.interactions.setColors(
      colorByIds.flatMap((group) => {
        const color = hexToRgba(group.color)
        return this.toGroups(group.objectIds).map((g) => ({ ...g, color }))
      })
    )
  }

  public isolateObjects = (objectIds: string[]) => {
    if (!this.interactions) return
    this.interactions.setIsolation(this.toGroups(objectIds))
  }

  public toggleGhostHidden = (_ghost: boolean) => {
    // Ghosting is not available on the viewer-3 path yet; filtered objects hide.
    console.warn('ghost mode is not yet available on the viewer-3 path')
  }

  public unIsolateObjects = () => {
    if (!this.interactions) return
    // showAll() clears hides/isolation but deliberately NOT the filter channel
    // (interactions contract) — clearing the filter needs an explicit setFilter(null).
    this.interactions.setFilter(null)
    this.interactions.showAll()
    useVisualStore().pushDiagEvent('filter cleared — showing all objects')
  }

  // ── loading ────────────────────────────────────────────────────────────────

  /** Keep the on-demand frame loop ticking while geometry is still streaming so the
   *  socket keeps serving waves without user interaction. Stops after 10s of stream
   *  quiet (or a 15-min cap for pathologically slow links). */
  private startStreamKeepAlive() {
    this.stopStreamKeepAlive()
    const startedAt = Date.now()
    this.lastStreamActivity = Date.now()
    this.streamKeepAlive = setInterval(() => {
      const quietMs = Date.now() - this.lastStreamActivity
      const totalMs = Date.now() - startedAt
      if (quietMs > 10_000 || totalMs > 900_000) {
        this.stopStreamKeepAlive()
        return
      }
      this.renderer?.requestRender()
    }, 250) // wave cadence is per-frame: 4 ticks/s ≈ 4 read-waves/s on an idle viewport
  }

  private stopStreamKeepAlive() {
    if (this.streamKeepAlive) {
      clearInterval(this.streamKeepAlive)
      this.streamKeepAlive = null
    }
  }

  public loadModels = async (models: DecodedModelInfo[]) => {
    const store = useVisualStore()
    const renderer = this.renderer
    if (!renderer) return

    for (const rendererModelId of this.loadedModelIds) renderer.removeModel(rendererModelId)
    this.loadedModelIds = []
    this.dictionaries.clear()
    this.artifactFilesByModelId.clear()
    this.ordinalToModelId.clear()
    this.modelIdToOrdinal.clear()
    // per-load streaming counter: the renderer's totalMB never resets — rebaseline
    this.streamBaselineMB = this.lastStreamTotalMB

    // federation ordinal = position in the FULL models list (the connector's
    // keyOffset uses the same index) — needed for Object Key arithmetic
    models.forEach((m, ordinal) => {
      if (m.pipeline !== 'artifact') return
      const rendererModelId = `bundle_${m.versionId}`
      this.ordinalToModelId.set(ordinal, rendererModelId)
      this.modelIdToOrdinal.set(rendererModelId, ordinal)
    })

    // The identity mode resolved at parse time (metadata-led, see
    // objectIdentity.ts) rides on the data input. An Object Key binding needs
    // NO dictionary — skip the eav.objects.parquet download (tens of MB +
    // ~300MB of Map heap on whale models) entirely; anything else (Application
    // ID or undecided) keeps the dictionary path.
    this.idMode = store.dataInput?.idMode ?? 'unknown'
    const objectKeyBinding = this.idMode === 'objectKey'
    store.pushDiagEvent(
      objectKeyBinding
        ? 'id mode: Object Key — skipping dictionary download'
        : `id mode: ${this.idMode === 'applicationId' ? 'Application ID' : 'undecided'} — dictionary download enabled`
    )

    // legacy-pipeline models can't be rendered by the artifact loader; the UI
    // explains this (see ViewerWrapper) — only artifact models are loaded
    const artifactModels = models.filter((m) => m.pipeline === 'artifact')

    const onProgress = (p: LoadProgress): void => {
      switch (p.phase) {
        case 'index':
          store.setLoadingProgress('Fetching index', null)
          break
        case 'preparing': {
          const pct =
            p.bytesTotal && p.bytesTotal > 0
              ? ` (${Math.round((p.bytesLoaded / p.bytesTotal) * 100)}%)`
              : ''
          store.setLoadingProgress(`Preparing 3D stream${pct}`, null)
          break
        }
        case 'painting':
          // First paint: drop the blocking overlay — geometry keeps streaming in
          // behind it (out-of-core: there is deliberately no "100% loaded").
          store.clearLoadingProgress()
          break
        default:
          break
      }
    }

    for (const model of artifactModels) {
      // Any failure in this chain used to strand the loading overlay silently
      // (loadModels runs fire-and-forget off the emitter) — surface it instead.
      let payload
      try {
        const artifactsUrl = buildArtifactsUrl(model.server, model)
        payload = await fetchArtifactsPayload(artifactsUrl, model.token)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[viewer3] artifacts fetch failed for ${model.versionId}`, err)
        store.setLoadingProgress(`Load failed: ${msg}`, null)
        continue
      }

      // The files list also serves a later rebind INTO Application ID mode
      // (ensureDictionaries) without reloading the model.
      this.artifactFilesByModelId.set(`bundle_${model.versionId}`, payload.files)

      // The applicationId dictionary rides alongside the paint — both only need the
      // artifacts payload. Not needed at all under an Object Key binding.
      const dictionaryPromise = objectKeyBinding ? null : loadObjectsDictionary(payload.files)

      store.setLoadingProgress('Streaming geometry', null)
      try {
        await loadRemoteOnly({
          renderer,
          serverUrl: model.server,
          token: model.token,
          versionId: model.versionId,
          modelName: model.modelId,
          payload,
          residencyFraction: RESIDENCY_FRACTION,
          onProgress
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[viewer3] remote stream failed for ${model.versionId}`, err)
        store.setLoadingProgress(`Stream failed: ${msg}`, null)
        void dictionaryPromise?.catch(() => undefined)
        continue
      }
      // The renderer registers the model under `bundle_${versionId}` (its internal
      // artifact id — the id picks report and getModelMaps expects). Key EVERYTHING
      // by that id or every paint/pick silently no-ops.
      const rendererModelId = `bundle_${model.versionId}`
      this.loadedModelIds.push(rendererModelId)
      this.startStreamKeepAlive()

      store.pushDiagEvent(`model ${model.versionId} painting — geometry keeps streaming`)

      if (dictionaryPromise) {
        try {
          const dictionary = await dictionaryPromise
          this.dictionaries.set(rendererModelId, dictionary)
          const msg =
            `objects dictionary for ${rendererModelId}: ` +
            `${dictionary.toIndex.size} applicationIds mapped`
          console.log(`[viewer3] ${msg}`)
          store.pushDiagEvent(msg)
        } catch (err) {
          console.error(
            `objects dictionary failed for ${model.versionId} — selection/coloring degraded`,
            err
          )
          store.pushDiagEvent(
            `objects dictionary FAILED for ${model.versionId} — selection/coloring degraded`
          )
        }
      }
    }

    // the model's true object count — the store's filter discriminator compares
    // the paged row universe against it (complete universe < total = filtered).
    // Sourced from the renderer's own .dat-derived maps (works in BOTH id modes,
    // no dictionary required); dictionary sizes are the fallback.
    let totalObjects = 0
    for (const rendererModelId of this.loadedModelIds) {
      const maps = renderer.getModelMaps(rendererModelId)
      if (maps) totalObjects += maps.objectCsr.objectCount
      else totalObjects += this.dictionaries.get(rendererModelId)?.toIndex.size ?? 0
    }
    store.setTotalObjectCount(totalObjects)

    // re-measure + full render now that layout settled — in the PBI sandbox the
    // init-time measure can be stale and window resize never fires
    this.resizeViewer()

    // scene views from the object graph don't exist on the artifact path
    store.setSpeckleViews([])

    Tracker.dataLoaded({
      sourceHostApp: store.receiveInfo.sourceApplication,
      workspace_id: store.receiveInfo.workspaceId,
      core_version: store.receiveInfo.version
    })

    if (store.cameraPosition) {
      const [px, py, pz, tx, ty, tz] = store.cameraPosition
      const controls = renderer.getCameraRig()
      type WorldPoint = Parameters<typeof controls.fromPositionAndTarget>[0]
      controls.fromPositionAndTarget(
        { x: px, y: py, z: pz } as WorldPoint,
        { x: tx, y: ty, z: tz } as WorldPoint
      )
    } else {
      this.zoomExtends()
    }

    // Emit objects loaded event to trigger update
    this.emit('objectsLoaded')
  }

  // ── event plumbing ─────────────────────────────────────────────────────────

  private handlePing = (message: string) => {
    console.log(message)
  }

  private handleObjectsLoaded = () => {
    console.log('🎯 Objects loaded - triggering update')
    const store = useVisualStore()
    // Handle state restoration after objects are loaded
    store.handleObjectsLoadedComplete()
  }

  private capturePointerUp = (ev: PointerEvent) => {
    this.lastPointerUp = ev
  }

  /** The renderer's pick result → the host's Hit (guid = applicationId). */
  private handlePlacementsPicked = (payload: {
    modelId: string
    pickResult: {
      placementIndex: number
      hitPoint: { x: number; y: number; z: number }
    } | null
  }) => {
    const ev = this.lastPointerUp ?? undefined
    const isMultiSelect = !!ev && (ev.ctrlKey || ev.shiftKey || ev.metaKey)

    let hit: Hit | null = null
    const pick = payload.pickResult
    if (pick && this.renderer) {
      const maps = this.renderer.getModelMaps(payload.modelId)
      const objectIndex = maps?.placementObjectIdx[pick.placementIndex]
      const appId =
        objectIndex !== undefined
          ? this.boundIdOf({ modelId: payload.modelId, objectIndex })
          : null
      if (appId) {
        hit = {
          guid: appId,
          object: { id: appId, applicationId: appId },
          point: { x: pick.hitPoint.x, y: pick.hitPoint.y, z: pick.hitPoint.z }
        }
      }
    }
    this.emit('objectClicked', hit, isMultiSelect, ev)
  }

  public dispose() {
    useVisualStore().pushDiagEvent('viewer disposed (renderer torn down)')
    this.stopStreamKeepAlive()
    if (this.streamStatsDecay) clearTimeout(this.streamStatsDecay)
    useVisualStore().setStreamingStats(null)
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers = []
    this.canvas?.removeEventListener('pointerup', this.capturePointerUp, {
      capture: true
    } as EventListenerOptions)
    this.interactions?.dispose()
    this.interactions = null
    this.bridge.unbind()
    this.renderer?.dispose()
    this.renderer = null
    this.canvas?.remove()
    this.canvas = null
  }
}
