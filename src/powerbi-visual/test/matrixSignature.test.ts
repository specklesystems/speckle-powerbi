import assert from 'node:assert/strict'

import { matrixSignature } from '../src/utils/matrixSignature'

const matrixWithHighlight = (selectedId: string | null): powerbi.DataViewMatrix =>
  ({
    rows: {
      root: {
        children: ['Value 1', 'Value 2'].map((id) => ({
          value: id,
          values: {
            0: {
              highlight: selectedId === null ? undefined : selectedId === id ? 1 : null
            }
          }
        }))
      }
    }
  } as unknown as powerbi.DataViewMatrix)

const row1Signature = matrixSignature(matrixWithHighlight('Value 1'), false)
const row2Signature = matrixSignature(matrixWithHighlight('Value 2'), false)
const clearedSignature = matrixSignature(matrixWithHighlight(null), false)

assert.notEqual(
  row1Signature,
  row2Signature,
  'replacing one highlighted Application ID with another must produce a new update signature'
)
assert.notEqual(
  row1Signature,
  clearedSignature,
  'clearing a highlight must produce a new signature'
)
assert.equal(
  row2Signature,
  matrixSignature(matrixWithHighlight('Value 2'), false),
  'an identical highlighted Application ID should keep a stable signature'
)

console.log('matrixSignature regression tests passed')
