import assert from 'node:assert/strict'

import { decodeModelInfo } from '../src/utils/decodeUserInfo'

const required = {
  schemaVersion: 2,
  pipeline: 'artifact',
  server: 'https://example.test',
  projectId: 'project-1',
  modelId: 'model-1',
  versionId: 'version-1',
  token: '<REDACTED>'
}

const encode = (record: object) => btoa(JSON.stringify(record))

// userId is carried through when the connector emits it
assert.equal(decodeModelInfo(encode({ ...required, userId: 'user-1' })).userId, 'user-1')

// blobs from connectors without userId still decode
assert.equal(decodeModelInfo(encode(required)).userId, undefined)

// the connector emits null when the user query fails
assert.equal(decodeModelInfo(encode({ ...required, userId: null })).userId, null)

console.log('decodeUserInfo tests passed')
