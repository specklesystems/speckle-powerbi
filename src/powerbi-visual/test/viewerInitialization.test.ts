import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'

import { useVisualStore } from '../src/store/visualStore'
import { SpeckleDataInput } from '../src/types'

const input: SpeckleDataInput = {
  modelInfos: [
    {
      schemaVersion: 2,
      pipeline: 'artifact',
      server: 'https://example.test',
      projectId: 'project-1',
      modelId: 'model-1',
      versionId: 'version-1',
      token: '<REDACTED>'
    }
  ],
  versionKey: 'version-1',
  hasLegacyModels: false,
  objectIds: ['object-1'],
  selectedIds: [],
  colorByIds: null,
  colorByField: null,
  colorByCategories: null,
  objectTooltipData: new Map(),
  hasActiveFilters: false,
  universeComplete: true
}

const main = async () => {
  setActivePinia(createPinia())

  const store = useVisualStore()
  const firstViewerEvents: string[] = []

  // Power BI can deliver its initial data before ViewerWrapper finishes its
  // asynchronous renderer initialization. Keep that input pending.
  store.setViewerReloadNeeded()
  store.setLoadingProgress('Loading model', null)
  await store.setDataInput(input)

  store.setViewerEmitter(((event: string) => {
    firstViewerEvents.push(event)
  }) as never)
  await Promise.resolve()

  assert.equal(
    firstViewerEvents.filter((event) => event === 'loadModels').length,
    1,
    'the first viewer emitter must consume a model load queued before initialization'
  )
  assert.equal(store.loadingProgress, undefined, 'the queued model load must clear loading state')

  // Replacing an initialized renderer must still reload the current model into
  // the fresh renderer, preserving the existing focus/layout re-mount behavior.
  const replacementViewerEvents: string[] = []
  store.setViewerEmitter(((event: string) => {
    replacementViewerEvents.push(event)
  }) as never)
  await Promise.resolve()

  assert.equal(
    replacementViewerEvents.filter((event) => event === 'loadModels').length,
    1,
    'a replacement viewer emitter must reload the already-loaded model'
  )

  console.log('viewer initialization handshake tests passed')
}

void main()
