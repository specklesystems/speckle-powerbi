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

const matrixWithTooltip = (
  displayName: string | null,
  value: string | null = null,
  nestedUnderColorBy = false
): powerbi.DataViewMatrix => {
  const objectNode = {
    value: 'wall-1',
    values: displayName === null ? {} : { 0: { value } }
  }
  return {
    valueSources:
      displayName === null ? [] : [{ displayName, roles: { tooltipData: true } }],
    rows: {
      root: {
        children: nestedUnderColorBy
          ? [{ value: 'Exterior', children: [objectNode] }]
          : [objectNode]
      }
    }
  } as unknown as powerbi.DataViewMatrix
}

const matrixWithLegacyModelInfo = (
  modelInfo: string,
  tooltipValue: string
): powerbi.DataViewMatrix =>
  ({
    valueSources: [
      { displayName: 'Model Info', roles: { modelInfo: true } },
      { displayName: 'First category', roles: { tooltipData: true } }
    ],
    rows: {
      root: {
        children: [
          {
            value: 'wall-1',
            values: { 0: { value: modelInfo }, 1: { value: tooltipValue } }
          }
        ]
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
assert.notEqual(
  matrixSignature(matrixWithTooltip(null), false),
  matrixSignature(matrixWithTooltip('First category'), false),
  'adding an Object Data (Tooltip) binding must produce a new update signature'
)
assert.notEqual(
  matrixSignature(matrixWithTooltip('First category', 'Walls'), false),
  matrixSignature(matrixWithTooltip('First category', 'Doors'), false),
  'changing an Object Data (Tooltip) value must produce a new update signature'
)
assert.equal(
  matrixSignature(matrixWithTooltip('First category', 'Walls'), false),
  matrixSignature(matrixWithTooltip('First category', 'Walls'), false),
  'identical Object Data (Tooltip) schema and values should keep a stable signature'
)
assert.notEqual(
  matrixSignature(matrixWithTooltip('First category', 'Walls', true), false),
  matrixSignature(matrixWithTooltip('First category', 'Doors', true), false),
  'changing a nested Object Data (Tooltip) value must produce a new update signature'
)
assert.equal(
  matrixSignature(matrixWithLegacyModelInfo('large-blob-a', 'Walls'), false),
  matrixSignature(matrixWithLegacyModelInfo('large-blob-b', 'Walls'), false),
  'changing an unrelated legacy Model Info value should keep the signature stable'
)
assert.notEqual(
  matrixSignature(matrixWithLegacyModelInfo('large-blob', 'Walls'), false),
  matrixSignature(matrixWithLegacyModelInfo('large-blob', 'Doors'), false),
  'changing a role-identified tooltip value at a nonzero index must change the signature'
)

console.log('matrixSignature regression tests passed')
