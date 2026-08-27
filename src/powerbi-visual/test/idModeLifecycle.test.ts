import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'

import { useVisualStore } from '../src/store/visualStore'
import { SpeckleDataInput } from '../src/types'
import { IdMode } from '../src/utils/objectIdentity'

const makeInput = (idMode: IdMode | null, objectIds: string[]): SpeckleDataInput => ({
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
  idMode,
  objectIds,
  selectedIds: [],
  colorByIds: null,
  colorByField: null,
  colorByCategories: null,
  objectTooltipData: new Map(),
  hasActiveFilters: false,
  universeComplete: true
})

const main = async () => {
  setActivePinia(createPinia())

  const store = useVisualStore()
  const events: Array<{ event: string; payload: unknown[] }> = []
  store.setViewerEmitter(((event: string, ...payload: unknown[]) => {
    events.push({ event, payload })
  }) as never)

  // First load: Object Key binding — the resolved mode rides ahead of the load.
  store.setViewerReloadNeeded()
  await store.setDataInput(makeInput('objectKey', ['1', '2']))

  const firstModes = events.filter((e) => e.event === 'setIdMode')
  assert.equal(firstModes.length, 1, 'every data update carries the identity mode')
  assert.deepEqual(firstModes[0].payload, ['objectKey'])
  assert.equal(
    events.filter((e) => e.event === 'loadModels').length,
    1,
    'the first input loads the model'
  )

  // Same model/version rebound to Application ID: the mode must switch
  // immediately WITHOUT another model load (the old lifecycle locked the mode
  // inside loadModels, so a same-version rebind never updated it).
  events.length = 0
  await store.setDataInput(makeInput('applicationId', ['guid-a', 'guid-b']))

  const rebindModes = events.filter((e) => e.event === 'setIdMode')
  assert.equal(rebindModes.length, 1, 'a same-version rebind still emits the mode')
  assert.deepEqual(
    rebindModes[0].payload,
    ['applicationId'],
    'rebinding the same version switches the emitted identity mode'
  )
  assert.equal(
    events.filter((e) => e.event === 'loadModels').length,
    0,
    'a same-version rebind must not reload the model'
  )

  // ...and back to Object Key, still without a reload.
  events.length = 0
  await store.setDataInput(makeInput('objectKey', ['1']))
  assert.deepEqual(
    events.filter((e) => e.event === 'setIdMode')[0]?.payload,
    ['objectKey'],
    'switching back to Object Key mode is immediate too'
  )
  assert.equal(events.filter((e) => e.event === 'loadModels').length, 0)

  console.log('identity-mode lifecycle tests passed')
}

void main()
