import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createRendererBridge } from '../src/viewer3/bridge'
import { createViewerInteractions } from '../src/viewer3/objects/interactions'
import type { SemanticMaps } from '../src/viewer3/modelMaps'
import type { Renderer } from '@speckle/viewer-webgpu'

/**
 * Click-to-select, end to end through the bridge.
 *
 * This path is only exercised by real events, and every part of it is
 * string-keyed (`ViewerHandle.on` takes `event: string`, payloads are `any`),
 * so the compiler cannot see a viewer-side rename. It has bitten twice:
 * 2026.8.28 renamed `viewer:placementsPicked` → `viewer:placementPicked`, and
 * 2026.8.31 moved the placement→object map out of the renderer entirely.
 * Both showed up as "clicking does nothing", with no error anywhere.
 */

/** Model with 3 placements over 2 objects, based at global placement 100. */
const semanticMaps: SemanticMaps = {
  placementRealizationIdx: new Uint32Array([0, 1, 0]),
  realizationObjectIdx: new Uint32Array([0, 1]),
  objectCount: 2
}
const MODEL_ID = 'bundle_version-1'
const BASE = 100

const fakeRenderer = (): Renderer =>
  ({
    getModelPlacementRange: (modelId: string) =>
      modelId === MODEL_ID ? [BASE, BASE + 3] : null,
    setColor: () => undefined,
    resetMaterialBatched: () => undefined,
    hideObjects: () => undefined,
    showObjects: () => undefined,
    requestRender: () => undefined
  }) as unknown as Renderer

const testPickSelectsTheObjectUnderTheCursor = async () => {
  const bridge = createRendererBridge()
  bridge.bind(fakeRenderer())
  const interactions = createViewerInteractions({ renderer: bridge.handle })

  bridge.emitter.emit('viewer:loadArtifactComplete', {
    artifactId: MODEL_ID,
    loadTime: 0,
    semanticMaps
  })
  await Promise.resolve()

  // Global placement 101 is the model's local placement 1 → realization 1 → object 1.
  bridge.emitter.emit('viewer:placementPicked', {
    modelId: MODEL_ID,
    pickResult: { placementIndex: BASE + 1 }
  })
  await Promise.resolve()

  assert.deepEqual(
    interactions.getSnapshot().selection,
    [{ modelId: MODEL_ID, objectIndex: 1 }],
    'a pick must resolve the global placement to its object and select it'
  )

  // A miss clears the selection (a plain click on empty space).
  bridge.emitter.emit('viewer:placementPicked', { modelId: '', pickResult: null })
  await Promise.resolve()
  assert.deepEqual(
    interactions.getSnapshot().selection,
    [],
    'a pick miss clears the selection'
  )

  interactions.dispose()
}

/**
 * Every `viewer:*` event this codebase subscribes to must actually be emitted
 * by the installed viewer build. Catches the rename class wholesale, including
 * events no test drives.
 */
const testSubscribedEventsExistInTheViewerBundle = () => {
  const sources = [
    'src/plugins/viewer.ts',
    'src/viewer3/bridge.ts',
    'src/viewer3/objects/interactions.ts'
  ]
  const bundle = readFileSync(
    join(__dirname, '..', 'node_modules/@speckle/viewer-webgpu/dist/index.js'),
    'utf8'
  )
  const emitted = new Set(
    Array.from(bundle.matchAll(/"(viewer:[a-zA-Z]+)"/g), (match) => match[1])
  )
  assert.ok(emitted.size > 0, 'the viewer bundle must declare some events')

  const subscribed = new Set<string>()
  for (const source of sources) {
    const text = readFileSync(join(__dirname, '..', source), 'utf8')
    for (const match of text.matchAll(/'(viewer:[a-zA-Z]+)'/g)) subscribed.add(match[1])
  }
  assert.ok(subscribed.size > 0, 'the sources must subscribe to some events')

  const missing = Array.from(subscribed).filter((event) => !emitted.has(event))
  assert.deepEqual(
    missing,
    [],
    `subscribed to viewer events the installed viewer never emits: ${missing.join(', ')}`
  )
}

const main = async () => {
  await testPickSelectsTheObjectUnderTheCursor()
  testSubscribedEventsExistInTheViewerBundle()
  console.log('pick selection tests passed')
}

void main()
