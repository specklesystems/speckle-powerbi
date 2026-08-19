import assert from 'node:assert/strict'

import { createViewerInteractions } from '../src/viewer3/objects/interactions'
import { ViewerHandle, ViewerModelMaps } from '../src/viewer3/objects/types'

type EventHandler = (payload: unknown) => void

const main = async () => {
  const eventHandlers = new Map<string, EventHandler[]>()
  const paintedColors: Array<{ placements: number[]; color: number }> = []
  let modelMaps: ViewerModelMaps | null = null

  const renderer: ViewerHandle = {
    on: (event, handler) => {
      const handlers = eventHandlers.get(event) ?? []
      handlers.push(handler as EventHandler)
      eventHandlers.set(event, handlers)
      return () => undefined
    },
    getModelMaps: () => modelMaps,
    setColor: (placements, color) => {
      paintedColors.push({ placements: Array.from(placements), color })
    },
    resetMaterials: () => undefined,
    hideObjects: () => undefined,
    showObjects: () => undefined,
    requestRender: () => undefined
  }

  const interactions = createViewerInteractions({ renderer })
  const color = 0x336699ff

  // Power BI can submit Color By while the artifact is still registering.
  // The declarative color state is retained, but there are no model maps to paint yet.
  interactions.setColors([{ modelId: 'bundle_version-1', objectIndexes: [0], color }])
  await Promise.resolve()
  assert.equal(paintedColors.length, 0, 'colors cannot paint before model maps exist')

  modelMaps = {
    placementObjectIdx: new Uint32Array([0]),
    objectCsr: {
      offsets: new Uint32Array([0, 1]),
      placements: new Uint32Array([7]),
      objectCount: 1
    }
  }

  for (const handler of eventHandlers.get('viewer:loadArtifactComplete') ?? []) {
    handler({ artifactId: 'bundle_version-1' })
  }
  await Promise.resolve()

  assert.deepEqual(
    paintedColors,
    [{ placements: [7], color }],
    'model readiness must repaint Color By state submitted before model maps existed'
  )

  interactions.dispose()
  console.log('model-ready color replay test passed')
}

void main()
