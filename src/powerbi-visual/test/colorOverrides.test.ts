import assert from 'node:assert/strict'

import {
  absentOverrides,
  BLANK_LABEL,
  ColorByCategory,
  displayLabel,
  effectiveColorGroups,
  emptyOverridesFile,
  encodeValueKey,
  normalizeHex,
  overrideCount,
  parseOverridesFile,
  serializeOverridesFile,
  valueKeyTypeTag,
  withOverride,
  withoutField,
  withoutOverride
} from '../src/utils/colorOverrides'

// ── identity: typed raw value, exact match only ──────────────────────────────

assert.equal(encodeValueKey('Active'), 's:Active')
assert.notEqual(
  encodeValueKey('1'),
  encodeValueKey(1),
  'the string "1" and the number 1 share a display label but must stay independent categories'
)
assert.notEqual(
  encodeValueKey('true'),
  encodeValueKey(true),
  'the string "true" and the boolean true must stay independent categories'
)
assert.equal(encodeValueKey(null), 'null', 'null is a real configurable category')
assert.equal(encodeValueKey(undefined), 'null')
assert.equal(
  encodeValueKey(new Date('2026-01-02T03:04:05.000Z')),
  'd:2026-01-02T03:04:05.000Z',
  'dates key on their exact instant'
)
assert.notEqual(
  encodeValueKey('Active'),
  encodeValueKey('active'),
  'matching is exact — a changed raw value is a new category'
)

assert.equal(displayLabel(null), BLANK_LABEL)
assert.equal(displayLabel('Active'), 'Active')

assert.equal(valueKeyTypeTag('s:1'), 'text')
assert.equal(valueKeyTypeTag('n:1'), 'number')
assert.equal(valueKeyTypeTag('b:true'), 'true/false')
assert.equal(valueKeyTypeTag('null'), 'blank')

// ── hex validation ────────────────────────────────────────────────────────────

assert.equal(normalizeHex('#ab12cd'), '#AB12CD')
assert.equal(normalizeHex('ab12cd'), '#AB12CD', 'leading # is optional on input')
assert.equal(normalizeHex('  #AB12CD '), '#AB12CD')
assert.equal(normalizeHex('#ab12c'), null, 'incomplete hex must not validate')
assert.equal(normalizeHex('#ab12cg'), null)
assert.equal(normalizeHex('#ab12cd00'), null, 'alpha channels are out of scope')
assert.equal(normalizeHex(''), null)

// ── sparse mutations, per-field independence ─────────────────────────────────

const statusField = 'Table1.Status'
const levelField = 'Table1.Level'

let file = emptyOverridesFile()
file = withOverride(file, statusField, 'Status', 's:Active', 'Active', '#FF0000')
file = withOverride(file, statusField, 'Status', 'null', BLANK_LABEL, '#00FF00')
file = withOverride(file, levelField, 'Level', 'n:1', '1', '#0000FF')

assert.equal(overrideCount(file, statusField), 2)
assert.equal(overrideCount(file, levelField), 1)
assert.equal(overrideCount(file, 'Table1.Unknown'), 0)

// switching the Color-by field away and back preserves each field's mapping
const afterLevelEdit = withOverride(file, levelField, 'Level', 'n:2', '2', '#123456')
assert.equal(
  afterLevelEdit.fields[statusField].overrides['s:Active'].color,
  '#FF0000',
  'editing one field must not disturb another field´s overrides'
)

// individual reset removes only that sparse mapping
const afterReset = withoutOverride(file, statusField, 's:Active')
assert.equal(overrideCount(afterReset, statusField), 1)
assert.equal(afterReset.fields[statusField].overrides['null'].color, '#00FF00')
assert.equal(
  overrideCount(file, statusField),
  2,
  'mutation helpers must not mutate their input (optimistic rollback depends on it)'
)

// removing the last override drops the field entirely (stay sparse)
const emptied = withoutOverride(afterReset, statusField, 'null')
assert.equal(statusField in emptied.fields, false)
assert.equal(overrideCount(emptied, levelField), 1)

// resetting an unknown key is a no-op returning the same reference
assert.equal(withoutOverride(file, statusField, 's:Ghost'), file)

// Reset all clears only the named field
const afterResetAll = withoutField(file, statusField)
assert.equal(overrideCount(afterResetAll, statusField), 0)
assert.equal(overrideCount(afterResetAll, levelField), 1)
assert.equal(withoutField(afterResetAll, statusField), afterResetAll)

// ── serialization round trip ─────────────────────────────────────────────────

const roundTripped = parseOverridesFile(serializeOverridesFile(file))
assert.deepEqual(roundTripped, file, 'serialize → parse must round-trip exactly')

// visual duplication: the copy is deep-independent of the original
const duplicated = parseOverridesFile(serializeOverridesFile(file))
const editedCopy = withOverride(duplicated, statusField, 'Status', 's:Active', 'Active', '#ABCDEF')
assert.equal(editedCopy.fields[statusField].overrides['s:Active'].color, '#ABCDEF')
assert.equal(
  file.fields[statusField].overrides['s:Active'].color,
  '#FF0000',
  'edits to a duplicated visual´s mapping must not affect the original'
)

// malformed persisted payloads degrade instead of throwing
assert.deepEqual(parseOverridesFile(undefined), emptyOverridesFile())
assert.deepEqual(parseOverridesFile(''), emptyOverridesFile())
assert.deepEqual(parseOverridesFile('not json'), emptyOverridesFile())
assert.deepEqual(parseOverridesFile('42'), emptyOverridesFile())
assert.deepEqual(parseOverridesFile('{"fields": 3}'), emptyOverridesFile())
const partiallyValid = parseOverridesFile(
  JSON.stringify({
    version: 1,
    fields: {
      good: { displayName: 'Good', overrides: { 's:A': { color: '#112233', label: 'A' } } },
      badShape: 'nope',
      badEntries: {
        displayName: 'Bad',
        overrides: { 's:B': { color: 'not-a-color', label: 'B' }, 's:C': 7 }
      }
    }
  })
)
assert.equal(partiallyValid.fields.good.overrides['s:A'].color, '#112233')
assert.equal(overrideCount(partiallyValid, 'badShape'), 0)
assert.equal(
  overrideCount(partiallyValid, 'badEntries'),
  0,
  'entries with invalid colors are dropped rather than rendered'
)

// ── effective color resolution: override wins, automatic fallback ────────────

const categories: ColorByCategory[] = [
  { valueKey: 's:Active', label: 'Active', autoColor: '#AAAAAA', objectIds: ['1', '2'] },
  { valueKey: 'null', label: BLANK_LABEL, autoColor: '#BBBBBB', objectIds: ['3'] },
  { valueKey: 'n:1', label: '1', autoColor: '#CCCCCC', objectIds: ['4'] },
  { valueKey: 's:1', label: '1', autoColor: '#DDDDDD', objectIds: ['5'] }
]

const groups = effectiveColorGroups(categories, file.fields[statusField])
assert.deepEqual(groups, [
  { objectIds: ['1', '2'], color: '#FF0000' },
  { objectIds: ['3'], color: '#00FF00' },
  { objectIds: ['4'], color: '#CCCCCC' },
  { objectIds: ['5'], color: '#DDDDDD' }
])

// theme change: only automatic colors move, explicit overrides stay fixed
const rethemed = categories.map((category) => ({ ...category, autoColor: '#111111' }))
const rethemedGroups = effectiveColorGroups(rethemed, file.fields[statusField])
assert.equal(rethemedGroups[0].color, '#FF0000', 'override stays fixed through a theme change')
assert.equal(rethemedGroups[2].color, '#111111', 'automatic colors follow the theme')

// duplicate labels resolve independently (n:1 vs s:1 above share the label "1")
const withNumberOverride = withOverride(file, statusField, 'Status', 'n:1', '1', '#654321')
const collidingGroups = effectiveColorGroups(categories, withNumberOverride.fields[statusField])
assert.equal(collidingGroups[2].color, '#654321')
assert.equal(collidingGroups[3].color, '#DDDDDD')

assert.deepEqual(
  effectiveColorGroups(categories, undefined).map((group) => group.color),
  ['#AAAAAA', '#BBBBBB', '#CCCCCC', '#DDDDDD'],
  'no overrides for the field → pure automatic palette'
)

// ── temporary absence: enumerable while gone, restored when it returns ───────

const filteredCategories = categories.filter((category) => category.valueKey !== 's:Active')
const absent = absentOverrides(filteredCategories, file.fields[statusField])
assert.deepEqual(absent, [
  { valueKey: 's:Active', entry: { color: '#FF0000', label: 'Active' } }
])

// the value returns (refresh / filter cleared): no longer absent, override reapplies
assert.deepEqual(absentOverrides(categories, file.fields[statusField]), [])
assert.equal(
  effectiveColorGroups(categories, file.fields[statusField])[0].color,
  '#FF0000',
  'a previously overridden value that returns receives its override again'
)

assert.deepEqual(absentOverrides(categories, undefined), [])

console.log('colorOverrides round-trip tests passed')
