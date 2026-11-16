import assert from 'node:assert/strict'

import { createRendererBridge } from '../src/viewer3/bridge'
import { paintEffectiveState } from '../src/viewer3/objects/paint'
import type { ViewerHandle, ViewerModelMaps } from '../src/viewer3/objects/types'
import type { Renderer } from '@speckle/viewer-webgpu'

/** viewer-webgpu 2026.10.12 split packed 0xRRGGBBAA into rgb + a 0–1 alpha. */
const testBridgeSplitsPackedRgba = () => {
  const calls: Array<{ rgb: number; alpha: number | undefined }> = []
  const bridge = createRendererBridge()
  bridge.bind({
    setColor: (_placements: ArrayLike<number>, rgb: number, alpha?: number) => {
      calls.push({ rgb, alpha })
    }
  } as unknown as Renderer)

  bridge.handle.setColor([4], 0x336699ff)

  assert.deepEqual(calls, [{ rgb: 0x336699, alpha: 1 }])
}

/**
 * Isolation hides the model, then shows survivors. A tint no longer shows a
 * placement, so the tinted survivor has to be in that show.
 */
const testIsolatedTintIsShown = () => {
  const shown: number[][] = []
  const tinted: Array<{ placements: number[]; color: number }> = []
  const maps: ViewerModelMaps = {
    objectCsr: {
      offsets: new Uint32Array([0, 1, 2]),
      placements: new Uint32Array([10, 11]),
      objectCount: 2
    },
    objectOfPlacement: () => undefined
  }
  const renderer: ViewerHandle = {
    on: () => () => undefined,
    getModelMaps: () => maps,
    setColor: (placements, color) => {
      tinted.push({ placements: Array.from(placements), color })
    },
    resetMaterials: () => undefined,
    hideObjects: () => undefined,
    showObjects: (indices) => {
      shown.push(Array.from(indices))
    },
    requestRender: () => undefined
  }

  paintEffectiveState({
    renderer,
    view: {
      manual: { hidden: new Map(), isolatedTo: new Map([['m', new Set([1])]]) },
      filter: null
    },
    selection: [],
    colors: new Map([['m', new Map([[1, 0x336699ff]])]]),
    previous: new Map(),
    selectionColor: 0x3b82f6ff,
    targets: ['m']
  })

  assert.deepEqual(shown, [[11]])
  assert.deepEqual(tinted, [{ placements: [11], color: 0x336699ff }])
}

const main = () => {
  testBridgeSplitsPackedRgba()
  testIsolatedTintIsShown()
  console.log('viewer color tests passed')
}

main()
