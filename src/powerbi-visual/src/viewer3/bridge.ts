// Vendored from @speckle/ts-sdk (packages/ts-sdk/src/viewer/bridge.ts, speckle-server-internal@speckle/next).
// @speckle/ts-sdk is private/unpublished; keep this copy in sync until it ships.
import { createModelMapsCache, type SemanticMaps } from './modelMaps.js'
import type { ViewerHandle } from './objects/types.js'
import type { Renderer } from '@speckle/viewer-webgpu'

type Listener = (payload: unknown) => void

/**
 * Renderer event bus owned by the bridge. Runtime-compatible with
 * `@speckle/viewer-webgpu`'s `Emitter` (`on` returns an unsubscribe, `emit`
 * takes an optional payload, plus `off`/`clear`) so the renderer can be
 * created WITH this bus once it boots — while the synchronous tier of
 * `createViewer` (bridge + interactions) needs no runtime renderer import.
 * The renderer's own `Emitter` class has private fields (nominally typed), so
 * the single hand-over point casts; this class is the receipt that the cast
 * is runtime-safe.
 */
export class BridgeEmitter {
  private readonly listeners = new Map<string, Set<Listener>>()

  on(event: string, fn: Listener): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(fn)
    return () => set.delete(fn)
  }

  emit(event: string, payload?: unknown): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const fn of set) fn(payload)
  }

  off(event: string, fn: Listener): void {
    this.listeners.get(event)?.delete(fn)
  }

  clear(): void {
    this.listeners.clear()
  }
}

export interface RendererBridge {
  emitter: BridgeEmitter
  handle: ViewerHandle
  bind: (renderer: Renderer) => void
  unbind: () => void
  /**
   * The maps the bridge maintains off the load/unload events — for the few
   * call sites that hold the raw `Renderer` (camera framing, object counts)
   * and used to call `Renderer.getModelMaps` themselves.
   */
  getModelMaps: ViewerHandle['getModelMaps']
}

/**
 * Bridge between the interactions layer (which needs a ViewerHandle at
 * construction time) and the renderer (which can only be created against a
 * mounted canvas): the bridge owns the event bus — create the renderer WITH
 * `bridge.emitter` so subscriptions registered at setup receive its events —
 * and late-binds every paint capability to the instance via `bind()`. All
 * capabilities no-op until bound, which is safe: nothing can be painted
 * before a model loads.
 */
export const createRendererBridge = (): RendererBridge => {
  const emitter = new BridgeEmitter()
  let live: Renderer | null = null

  // The maps arrive ONCE, in the load event (viewer-webgpu >= 2026.8.31 has no
  // getModelMaps accessor), so the cache must be listening before the renderer
  // exists — which is exactly what the bridge-owned bus is for. Subscribing
  // here also puts the cache ahead of the interactions layer in listener
  // order, so its `model-ready` repaint always finds the model paintable.
  const modelMaps = createModelMapsCache()
  emitter.on('viewer:loadArtifactComplete', (payload) => {
    const { artifactId, semanticMaps } = payload as {
      artifactId: string
      semanticMaps: SemanticMaps
    }
    if (semanticMaps) modelMaps.register(artifactId, semanticMaps)
  })
  emitter.on('viewer:unloadArtifactComplete', (payload) => {
    const { artifactId } = payload as { artifactId: string | null }
    modelMaps.unregister(artifactId)
  })

  const handle: ViewerHandle = {
    on: (event, handler) => emitter.on(event, handler),
    getModelMaps: (modelId) => modelMaps.get(modelId),
    setColor: (placements, rgba) => live?.setColor(placements, rgba),
    resetMaterials: (placements) => live?.resetMaterialBatched(placements),
    hideObjects: (indices) => live?.hideObjects(indices),
    showObjects: (indices) => live?.showObjects(indices),
    requestRender: () => live?.requestRender()
  }
  return {
    emitter,
    handle,
    getModelMaps: (modelId) => modelMaps.get(modelId),
    bind: (renderer): void => {
      live = renderer
      modelMaps.bind(renderer)
    },
    unbind: (): void => {
      live = null
      modelMaps.clear()
    }
  }
}
