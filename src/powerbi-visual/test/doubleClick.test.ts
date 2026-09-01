import assert from 'node:assert/strict'

import {
  resolveDoubleClickTarget,
  type PlacementHit
} from '../src/viewer3/doubleClick'
import type { ViewerModelMaps } from '../src/viewer3/objects/types'

/**
 * Double-click framing. The renderer did this itself until 2026.8.31 and then
 * stopped, which read as "double-click stopped zooming to selection" — the
 * host now owns the gesture, so it needs its own coverage.
 */

const MODEL_ID = 'bundle_version-1'
const BASE = 100

/** Model with 3 placements over 2 objects, based at global placement 100. */
const maps: ViewerModelMaps = {
  objectCsr: {
    offsets: new Uint32Array([0, 2, 3]),
    placements: new Uint32Array([BASE, BASE + 2, BASE + 1]),
    objectCount: 2
  },
  objectOfPlacement: (placementIndex) => {
    const local = placementIndex - BASE
    if (local < 0 || local > 2) return undefined
    return local === 1 ? 1 : 0
  }
}

const resolve = (
  hits: PlacementHit[] | null,
  overrides: Partial<Parameters<typeof resolveDoubleClickTarget>[0]> = {}
) =>
  resolveDoubleClickTarget({
    hits,
    firstVisibleHit: (candidates) => candidates[0] ?? null,
    modelAt: (placementIndex) =>
      placementIndex >= BASE && placementIndex < BASE + 3 ? MODEL_ID : null,
    getModelMaps: (modelId) => (modelId === MODEL_ID ? maps : null),
    ...overrides
  })

const main = () => {
  assert.deepEqual(
    resolve([{ placementIndex: BASE + 1 }]),
    { kind: 'object', group: { modelId: MODEL_ID, objectIndexes: [1] } },
    'a hit frames the object that owns the picked placement'
  )

  // The whole object, not the picked primitive: object 0 owns placements 100
  // and 102, and framing must cover both however it was hit.
  assert.deepEqual(
    resolve([{ placementIndex: BASE + 2 }]),
    { kind: 'object', group: { modelId: MODEL_ID, objectIndexes: [0] } },
    'any placement of an object resolves to that one object'
  )

  assert.deepEqual(resolve([]), { kind: 'extents' }, 'empty space zooms extents')
  assert.deepEqual(resolve(null), { kind: 'extents' }, 'a missing hit list is a miss')

  // Visibility: the renderer's filter is what stops a double-click from flying
  // to something hidden, isolated away or filtered out behind the cursor.
  assert.deepEqual(
    resolve([{ placementIndex: BASE }], { firstVisibleHit: () => null }),
    { kind: 'none' },
    'hits that are all invisible leave the camera alone'
  )

  // Not zoom-extents: hits existed, so this was NOT an empty-space click, and
  // treating it as one would fly the camera out from under the user.
  assert.notDeepEqual(
    resolve([{ placementIndex: BASE }], { firstVisibleHit: () => null }),
    { kind: 'extents' },
    'an all-invisible hit list must not be mistaken for empty space'
  )

  assert.deepEqual(
    resolve([{ placementIndex: 9999 }], { modelAt: () => null }),
    { kind: 'none' },
    'a placement owned by no loaded model resolves to nothing'
  )

  assert.deepEqual(
    resolve([{ placementIndex: BASE }], { getModelMaps: () => null }),
    { kind: 'none' },
    'a model with no maps yet resolves to nothing'
  )

  console.log('double click framing tests passed')
}

main()
