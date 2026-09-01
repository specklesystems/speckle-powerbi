import assert from 'node:assert/strict'

import { createModelMapsCache, type SemanticMaps } from '../src/viewer3/modelMaps'
import type { Renderer } from '@speckle/viewer-webgpu'

/**
 * The maps cache rebuilds what viewer-webgpu stopped handing out in 2026.8.31:
 * a per-model object→placement CSR in GLOBAL placement ids, derived from
 * model-local realization semantics plus the model's live placement base.
 *
 * Two properties matter and neither is exercised by the paint tests:
 *  - the counting sort groups a model's placements by owning object, including
 *    instanced realizations that share one object;
 *  - the global ids follow the placement base when an earlier model unloads
 *    and the renderer compacts the placement SoA underneath us.
 */

/** Just enough Renderer to answer placement-range questions. */
const fakeRenderer = (ranges: Map<string, [number, number]>): Renderer =>
  ({
    getModelPlacementRange: (modelId: string) => ranges.get(modelId) ?? null
  }) as unknown as Renderer

const main = () => {
  // Model A: 5 placements over 3 objects. Realizations 0 and 3 both belong to
  // object 0 (an instanced object) — the case a naive realization→object
  // identity mapping would get wrong.
  //   placement: 0    1    2    3    4
  //   realization: 0  1    3    2    0
  //   object:      0  1    0    2    0
  const semantics: SemanticMaps = {
    placementRealizationIdx: new Uint32Array([0, 1, 3, 2, 0]),
    realizationObjectIdx: new Uint32Array([0, 1, 2, 0]),
    objectCount: 3
  }

  const ranges = new Map<string, [number, number]>([
    ['model-a', [100, 105]],
    ['model-b', [0, 100]]
  ])
  const cache = createModelMapsCache()
  cache.bind(fakeRenderer(ranges))
  cache.register('model-a', semantics)

  const maps = cache.get('model-a')
  assert.ok(maps, 'a registered model with a live range resolves')
  assert.equal(maps.objectCsr.objectCount, 3)

  /** The global placement ids of one object, as paint would expand them. */
  const placementsOf = (objectIndex: number): number[] => {
    const { offsets, placements } = maps.objectCsr
    return Array.from(placements.slice(offsets[objectIndex], offsets[objectIndex + 1]))
  }

  // Base 100, so model-local p becomes global 100 + p.
  assert.deepEqual(placementsOf(0), [100, 102, 104], 'instanced object gathers all three')
  assert.deepEqual(placementsOf(1), [101])
  assert.deepEqual(placementsOf(2), [103])

  // Forward direction: the pick path hands in a global id.
  assert.equal(maps.objectOfPlacement(100), 0)
  assert.equal(maps.objectOfPlacement(103), 2)
  assert.equal(maps.objectOfPlacement(104), 0)
  assert.equal(maps.objectOfPlacement(99), undefined, 'below the range is not ours')
  assert.equal(maps.objectOfPlacement(105), undefined, 'above the range is not ours')

  // Unloading model-b compacts the SoA: model-a's 100 placements shift to 0.
  // The cache must re-read the range and rebase, or every paint lands on
  // whatever now occupies 100..104.
  ranges.delete('model-b')
  ranges.set('model-a', [0, 5])

  const shifted = cache.get('model-a')
  assert.ok(shifted)
  assert.deepEqual(placementsOf(0), [0, 2, 4], 'CSR rebases onto the new base')
  assert.deepEqual(placementsOf(1), [1])
  assert.equal(shifted.objectOfPlacement(0), 0, 'forward read rebases too')
  assert.equal(shifted.objectOfPlacement(100), undefined, 'the old ids are stale')

  // A model with no live range is gone from the scene — better to report
  // not-loaded than to serve placement ids that now belong to someone else.
  ranges.delete('model-a')
  assert.equal(cache.get('model-a'), null, 'no live range = not loaded')

  ranges.set('model-a', [0, 5])
  assert.ok(cache.get('model-a'), 'the entry survives a transient missing range')

  cache.unregister('model-a')
  assert.equal(cache.get('model-a'), null, 'unregistered models are gone')

  // Null artifact id on the unload event = the whole scene dropped.
  cache.register('model-a', semantics)
  cache.register('model-c', semantics)
  ranges.set('model-c', [0, 5])
  cache.unregister(null)
  assert.equal(cache.get('model-a'), null)
  assert.equal(cache.get('model-c'), null)

  console.log('model maps cache tests passed')
}

main()
