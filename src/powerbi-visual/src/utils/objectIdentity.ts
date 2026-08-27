/**
 * Pure identity classification + Object Key validation for the viewer's bound
 * id column ("Object Keys" field well, internal role `applicationIds`).
 *
 * Two identities can be bound:
 *  - 'objectKey': the connector's dense Int64 key (ordinal * 2^32 +
 *    object_index) — resolved by pure arithmetic, no dictionary download.
 *  - 'applicationId': source-model GUID strings, resolved through the
 *    per-version eav.objects.parquet dictionary (compatibility binding).
 *
 * Kept free of renderer/store imports so it tests without booting WebGPU.
 */

export type IdMode = 'objectKey' | 'applicationId'

/** The connector's federation namespace: Object Key = ordinal * 2^32 + object_index. */
export const KEY_SPACE = 4294967296

/** What the matrix data view knows about the bound identity column. */
export interface IdentityColumnMetadata {
  /** Power BI column type flags (ValueTypeDescriptor) of the bound source. */
  isNumeric?: boolean
  isText?: boolean
  /** Column display name, for the Object Key name fallback. */
  displayName?: string
}

/**
 * Metadata-led identity decision, in precedence order:
 *  1. numeric column metadata → Object Key mode;
 *  2. text column metadata → Application ID mode (numeric-LOOKING text
 *     Application IDs must stay in dictionary mode);
 *  3. the recognizable field name `Object Key` → Object Key mode (the retired
 *     `object_key` spelling is deliberately NOT recognized);
 *  4. value inspection of the first bound value, only as a final fallback.
 * Returns null when nothing is usable (no metadata, no name match, no values).
 */
export function classifyIdentityMode(
  metadata: IdentityColumnMetadata | null,
  sampleValue: string | undefined
): IdMode | null {
  if (metadata?.isNumeric) return 'objectKey'
  if (metadata?.isText) return 'applicationId'
  if (metadata?.displayName === 'Object Key') return 'objectKey'
  if (sampleValue === undefined) return null
  return /^\d+$/.test(sampleValue) ? 'objectKey' : 'applicationId'
}

/** Per-category counts of rejected Object Key values, with raw samples. */
export interface ObjectKeyIssues {
  malformed: number
  fractional: number
  negative: number
  unsafe: number
  unknownOrdinal: number
  /** first few offending raw values, for diagnostics */
  samples: string[]
}

export interface ObjectKeyResolution {
  /** federation ordinal → object indexes of the VALID keys, in input order */
  byOrdinal: Map<number, number[]>
  validCount: number
  /** null when every supplied key validated */
  issues: ObjectKeyIssues | null
}

const ISSUE_SAMPLE_LIMIT = 3

/**
 * Validates bound values as Object Keys before arithmetic resolution: finite
 * safe integers, non-negative, belonging to a known loaded federation ordinal.
 * Invalid values are counted per failure category (never thrown) so partial
 * inputs keep working and callers can fail open when nothing resolves.
 */
export function validateObjectKeys(
  objectIds: readonly string[],
  knownOrdinals: ReadonlySet<number>
): ObjectKeyResolution {
  const byOrdinal = new Map<number, number[]>()
  let validCount = 0
  const issues: ObjectKeyIssues = {
    malformed: 0,
    fractional: 0,
    negative: 0,
    unsafe: 0,
    unknownOrdinal: 0,
    samples: []
  }
  let issueCount = 0
  const reject = (category: keyof Omit<ObjectKeyIssues, 'samples'>, raw: string) => {
    issues[category]++
    issueCount++
    if (issues.samples.length < ISSUE_SAMPLE_LIMIT) issues.samples.push(raw)
  }

  for (const raw of objectIds) {
    const key = raw === '' ? NaN : Number(raw)
    if (!Number.isFinite(key)) {
      reject('malformed', raw)
      continue
    }
    if (!Number.isInteger(key)) {
      reject('fractional', raw)
      continue
    }
    if (key < 0) {
      reject('negative', raw)
      continue
    }
    if (!Number.isSafeInteger(key)) {
      reject('unsafe', raw)
      continue
    }
    const ordinal = Math.floor(key / KEY_SPACE)
    if (!knownOrdinals.has(ordinal)) {
      reject('unknownOrdinal', raw)
      continue
    }
    let indexes = byOrdinal.get(ordinal)
    if (!indexes) {
      indexes = []
      byOrdinal.set(ordinal, indexes)
    }
    indexes.push(key % KEY_SPACE)
    validCount++
  }

  return { byOrdinal, validCount, issues: issueCount > 0 ? issues : null }
}

/** One diagnostics line summarizing rejected keys, or null when all valid. */
export function describeObjectKeyIssues(
  issues: ObjectKeyIssues | null,
  totalCount: number
): string | null {
  if (!issues) return null
  const parts = (
    [
      ['malformed', issues.malformed],
      ['fractional', issues.fractional],
      ['negative', issues.negative],
      ['unsafe', issues.unsafe],
      ['unknown ordinal', issues.unknownOrdinal]
    ] as const
  )
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`)
  const rejected = issues.malformed + issues.fractional + issues.negative + issues.unsafe + issues.unknownOrdinal
  return (
    `Object Key validation: ${rejected} of ${totalCount} rejected ` +
    `(${parts.join(', ')}) — sample ${JSON.stringify(issues.samples)}`
  )
}
