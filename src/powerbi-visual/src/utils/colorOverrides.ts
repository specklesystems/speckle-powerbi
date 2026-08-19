/**
 * Categorical Color-by overrides: identity, serialization, and effective-color
 * resolution. Deliberately a pure module (no store/host/powerbi imports) so the
 * round-trip tests can run under the plain ts-node test harness.
 *
 * Identity model: an override belongs to (field identity, typed raw value).
 * - field identity = the Color By column's queryName — stable across report
 *   edits, distinct per table/column, and it survives switching the field away
 *   and back (each field keeps its own sparse mapping).
 * - value identity = a type-prefixed encoding of the raw category value, so the
 *   number 1 and the string "1" (identical display labels) stay independently
 *   configurable, and null is a real category. Matching is exact by design: a
 *   renamed/retyped raw value is a NEW category, never fuzzy-matched.
 *
 * Only explicit overrides are stored (sparse); categories without an entry keep
 * the automatic palette color, which continues following the report theme.
 */

export type RawCategoryValue = string | number | boolean | Date | null | undefined

export interface OverrideEntry {
  /** '#RRGGBB' uppercase, opaque */
  color: string
  /** display label captured at override time — shown for values absent from current data */
  label: string
}

export interface FieldOverrides {
  /** column display name captured at edit time (Reset-all dialog, diagnostics) */
  displayName: string
  /** valueKey → override; sparse: only explicitly overridden values */
  overrides: Record<string, OverrideEntry>
}

export interface OverridesFile {
  version: 1
  /** fieldKey (queryName) → that field's sparse overrides, preserved independently */
  fields: Record<string, FieldOverrides>
}

/** One Color-by category as parsed from the matrix data view, in data order. */
export interface ColorByCategory {
  /** typed raw-value identity (see encodeValueKey) */
  valueKey: string
  /** display label; BLANK_LABEL for null */
  label: string
  /** automatic palette color for this category ('#RRGGBB'-ish, host-provided) */
  autoColor: string
  objectIds: string[]
}

export const BLANK_LABEL = '(Blank)'

export const emptyOverridesFile = (): OverridesFile => ({ version: 1, fields: {} })

/** Typed raw category value → stable identity key. Exact matching only. */
export const encodeValueKey = (raw: RawCategoryValue): string => {
  if (raw === null || raw === undefined) return 'null'
  if (raw instanceof Date) return `d:${raw.toISOString()}`
  switch (typeof raw) {
    case 'number':
      return `n:${String(raw)}`
    case 'boolean':
      return `b:${String(raw)}`
    default:
      return `s:${String(raw)}`
  }
}

export const displayLabel = (raw: RawCategoryValue): string =>
  raw === null || raw === undefined ? BLANK_LABEL : String(raw)

/** Human-readable type tag, used to disambiguate colliding display labels. */
export const valueKeyTypeTag = (valueKey: string): string => {
  if (valueKey === 'null') return 'blank'
  switch (valueKey.charAt(0)) {
    case 'n':
      return 'number'
    case 'b':
      return 'true/false'
    case 'd':
      return 'date'
    default:
      return 'text'
  }
}

/** Strict opaque #RRGGBB (leading # optional), normalized to uppercase '#RRGGBB'. */
export const normalizeHex = (input: string): string | null => {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(input.trim())
  return match ? `#${match[1].toUpperCase()}` : null
}

const isOverrideEntry = (candidate: unknown): candidate is OverrideEntry => {
  if (typeof candidate !== 'object' || candidate === null) return false
  const entry = candidate as Record<string, unknown>
  return typeof entry.color === 'string' && normalizeHex(entry.color) !== null
}

/**
 * Parse the persisted JSON. Malformed input (or any malformed field/entry)
 * degrades to the empty/partial mapping instead of throwing — a corrupt blob
 * must never take the editor down, and unknown future shapes are dropped.
 */
export const parseOverridesFile = (json: string | null | undefined): OverridesFile => {
  const result = emptyOverridesFile()
  if (!json) return result
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return result
  }
  if (typeof parsed !== 'object' || parsed === null) return result
  const fields = (parsed as Record<string, unknown>).fields
  if (typeof fields !== 'object' || fields === null) return result
  for (const [fieldKey, rawField] of Object.entries(fields as Record<string, unknown>)) {
    if (typeof rawField !== 'object' || rawField === null) continue
    const field = rawField as Record<string, unknown>
    if (typeof field.overrides !== 'object' || field.overrides === null) continue
    const overrides: Record<string, OverrideEntry> = {}
    for (const [valueKey, rawEntry] of Object.entries(
      field.overrides as Record<string, unknown>
    )) {
      if (!isOverrideEntry(rawEntry)) continue
      overrides[valueKey] = {
        color: normalizeHex(rawEntry.color) as string,
        label: typeof rawEntry.label === 'string' ? rawEntry.label : valueKey
      }
    }
    result.fields[fieldKey] = {
      displayName: typeof field.displayName === 'string' ? field.displayName : fieldKey,
      overrides
    }
  }
  return result
}

export const serializeOverridesFile = (file: OverridesFile): string => JSON.stringify(file)

/** New file with (fieldKey, valueKey) → color set. Input is never mutated. */
export const withOverride = (
  file: OverridesFile,
  fieldKey: string,
  fieldDisplayName: string,
  valueKey: string,
  label: string,
  color: string
): OverridesFile => {
  const field = file.fields[fieldKey]
  return {
    version: 1,
    fields: {
      ...file.fields,
      [fieldKey]: {
        displayName: fieldDisplayName,
        overrides: { ...(field?.overrides ?? {}), [valueKey]: { color, label } }
      }
    }
  }
}

/** New file with one override removed; drops the field once it has none left. */
export const withoutOverride = (
  file: OverridesFile,
  fieldKey: string,
  valueKey: string
): OverridesFile => {
  const field = file.fields[fieldKey]
  if (!field || !(valueKey in field.overrides)) return file
  const overrides = { ...field.overrides }
  delete overrides[valueKey]
  const fields = { ...file.fields }
  if (Object.keys(overrides).length === 0) {
    delete fields[fieldKey]
  } else {
    fields[fieldKey] = { ...field, overrides }
  }
  return { version: 1, fields }
}

/** New file with an entire field's overrides cleared (Reset all). Other fields keep theirs. */
export const withoutField = (file: OverridesFile, fieldKey: string): OverridesFile => {
  if (!(fieldKey in file.fields)) return file
  const fields = { ...file.fields }
  delete fields[fieldKey]
  return { version: 1, fields }
}

export const overrideCount = (file: OverridesFile, fieldKey: string): number =>
  Object.keys(file.fields[fieldKey]?.overrides ?? {}).length

/**
 * Effective color per category: the explicit override wins, otherwise the
 * automatic palette color. Output shape matches the viewer's color channel.
 */
export const effectiveColorGroups = (
  categories: ColorByCategory[],
  field: FieldOverrides | undefined
): { objectIds: string[]; color: string }[] =>
  categories.map((category) => ({
    objectIds: category.objectIds,
    color: field?.overrides[category.valueKey]?.color ?? category.autoColor
  }))

/**
 * Persisted overrides whose value is absent from the current category list —
 * the `Not currently in data` section. They stay editable/resettable and regain
 * their color automatically when the value returns (exact-match resolution).
 */
export const absentOverrides = (
  categories: ColorByCategory[],
  field: FieldOverrides | undefined
): Array<{ valueKey: string; entry: OverrideEntry }> => {
  if (!field) return []
  const present = new Set(categories.map((category) => category.valueKey))
  return Object.entries(field.overrides)
    .filter(([valueKey]) => !present.has(valueKey))
    .map(([valueKey, entry]) => ({ valueKey, entry }))
}
