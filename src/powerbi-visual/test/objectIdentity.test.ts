import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  classifyIdentityMode,
  describeObjectKeyIssues,
  KEY_SPACE,
  validateObjectKeys
} from '../src/utils/objectIdentity'

// ── capability contract: visible label renamed, internal role preserved ─────

const capabilities = JSON.parse(
  readFileSync(join(__dirname, '..', 'capabilities.json'), 'utf-8')
) as { dataRoles: Array<{ name: string; displayName: string }> }

const idRole = capabilities.dataRoles.find((r) => r.name === 'applicationIds')
assert.ok(idRole, 'the internal role name applicationIds must survive (saved role bindings)')
assert.equal(
  idRole.displayName,
  'Object Keys',
  'the visible field-well label must be Object Keys'
)

// ── classifier precedence ────────────────────────────────────────────────────

// 1. numeric column metadata wins outright
assert.equal(
  classifyIdentityMode({ isNumeric: true, displayName: 'anything' }, 'not-a-number'),
  'objectKey',
  'numeric metadata selects Object Key mode regardless of values'
)

// 2. text metadata wins over a numeric-LOOKING value (text Application IDs)
assert.equal(
  classifyIdentityMode({ isText: true, displayName: 'Object Key' }, '123456'),
  'applicationId',
  'a numeric-looking value from a text-typed field stays in Application ID mode'
)

// 3. the Object Key field name is the fallback when type metadata is absent
assert.equal(
  classifyIdentityMode({ displayName: 'Object Key' }, 'abc'),
  'objectKey',
  'the Object Key name fallback applies when type metadata is unusable'
)

// ...and the retired snake_case spelling is deliberately NOT recognized
assert.equal(
  classifyIdentityMode({ displayName: 'object_key' }, 'abc-guid'),
  'applicationId',
  'no name fallback exists for the former object_key spelling'
)

// 4. value inspection only as the final fallback
assert.equal(classifyIdentityMode(null, '42'), 'objectKey')
assert.equal(classifyIdentityMode(null, '3fa2-guid'), 'applicationId')
assert.equal(
  classifyIdentityMode(null, undefined),
  null,
  'nothing usable classifies as null (mode undecided)'
)
assert.equal(
  classifyIdentityMode({ displayName: 'object_key' }, undefined),
  null,
  'an unrecognized name with no values stays undecided'
)

// ── Object Key validation ────────────────────────────────────────────────────

const ordinals = new Set([0, 1])

// valid keys group per federation ordinal in input order
{
  const keys = ['0', '5', String(KEY_SPACE + 7), '3']
  const { byOrdinal, validCount, issues } = validateObjectKeys(keys, ordinals)
  assert.equal(validCount, 4)
  assert.equal(issues, null, 'all-valid input reports no issues')
  assert.deepEqual(byOrdinal.get(0), [0, 5, 3])
  assert.deepEqual(byOrdinal.get(1), [7])
}

// each malformed category is diagnosed while valid keys keep resolving
{
  const keys = [
    '12', // valid
    'abc', // malformed
    '', // malformed
    '1.5', // fractional
    '-3', // negative
    '9007199254740993', // unsafe (2^53 + 1)
    String(5 * KEY_SPACE + 1) // unknown ordinal 5
  ]
  const { byOrdinal, validCount, issues } = validateObjectKeys(keys, ordinals)
  assert.equal(validCount, 1, 'partial invalid input keeps the valid keys')
  assert.deepEqual(byOrdinal.get(0), [12])
  assert.ok(issues, 'invalid values must be diagnosed')
  assert.equal(issues.malformed, 2)
  assert.equal(issues.fractional, 1)
  assert.equal(issues.negative, 1)
  assert.equal(issues.unsafe, 1)
  assert.equal(issues.unknownOrdinal, 1)
  assert.deepEqual(issues.samples, ['abc', '', '1.5'], 'samples carry the first raw offenders')

  const line = describeObjectKeyIssues(issues, keys.length)
  assert.ok(line, 'issues produce a diagnostics line')
  assert.ok(line.includes('6 of 7 rejected'), `diagnostics count rejected keys: ${line}`)
  assert.ok(line.includes('unknown ordinal 1'), `diagnostics name each category: ${line}`)
}

// a fully unresolved input resolves nothing (the viewer then fails open)
{
  const { byOrdinal, validCount, issues } = validateObjectKeys(['x', '-1', '2.2'], ordinals)
  assert.equal(validCount, 0)
  assert.equal(byOrdinal.size, 0)
  assert.ok(issues)
}

// no issues → no diagnostics line
assert.equal(describeObjectKeyIssues(null, 10), null)

console.log('object identity classifier/validator tests passed')
