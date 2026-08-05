// Vendored from @speckle/ts-sdk (packages/ts-sdk/src/viewer/bridge.ts, speckle-server-internal@speckle/next).
// @speckle/ts-sdk is private/unpublished; keep this copy in sync until it ships.
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
  const handle: ViewerHandle = {
    on: (event, handler) => emitter.on(event, handler),
    getModelMaps: (modelId) => live?.getModelMaps(modelId) ?? null,
    setColor: (placements, rgba) => live?.setColor(placements, rgba),
    resetMaterials: (placements) => live?.resetMaterialBatched(placements),
    hideObjects: (indices) => live?.hideObjects(indices),
    showObjects: (indices) => live?.showObjects(indices),
    requestRender: () => live?.requestRender()
  }
  return {
    emitter,
    handle,
    bind: (renderer): void => {
      live = renderer
    },
    unbind: (): void => {
      live = null
    }
  }
}
