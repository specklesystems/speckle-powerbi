/**
 * Cheap identity of a data update: row universe, highlight state, and tooltip data.
 * Persist-property round-trips re-send identical data every few seconds, so callers
 * can use this signature to avoid reprocessing an already-settled matrix.
 */
export const matrixSignature = (
  matrix: powerbi.DataViewMatrix,
  hasActiveFilters: boolean
): string => {
  let rows = 0
  let highlighted = 0
  let highlightedIdHash = 0x811c9dc5
  let tooltipHash = 0x811c9dc5
  // Object→category assignment (Color-by parent values + subtree sizes) and
  // per-leaf conditional-format colors: both change rendering without changing
  // the leaf-row universe, so they must not be swallowed by the memo.
  let groupingHash = 0x811c9dc5
  let tooltipColumns = 0
  let firstId = ''
  let lastId = ''
  const tooltipValueIndexes: number[] = []

  const hashGroupingString = (value: string): void => {
    groupingHash = Math.imul(groupingHash ^ value.length, 0x01000193)
    for (let index = 0; index < value.length; index++) {
      groupingHash = Math.imul(groupingHash ^ value.charCodeAt(index), 0x01000193)
    }
  }

  const hashTooltipString = (value: string): void => {
    // Include the length so adjacent values cannot produce the same byte stream.
    tooltipHash = Math.imul(tooltipHash ^ value.length, 0x01000193)
    for (let index = 0; index < value.length; index++) {
      tooltipHash = Math.imul(tooltipHash ^ value.charCodeAt(index), 0x01000193)
    }
  }

  matrix.valueSources?.forEach((source, index) => {
    if (!source.roles?.tooltipData) return
    tooltipColumns++
    tooltipValueIndexes.push(index)
    hashTooltipString(String(index))
    hashTooltipString(source.queryName ?? '')
    hashTooltipString(source.displayName)
  })

  const hashHighlightedId = (id: string): void => {
    // Include the length so adjacent IDs cannot produce the same byte stream.
    highlightedIdHash = Math.imul(highlightedIdHash ^ id.length, 0x01000193)
    for (let index = 0; index < id.length; index++) {
      highlightedIdHash = Math.imul(highlightedIdHash ^ id.charCodeAt(index), 0x01000193)
    }
  }

  const walk = (node: powerbi.DataViewMatrixNode): void => {
    const children = node.children
    if (!children || children.length === 0) {
      rows++
      const id = String(node.value ?? '')
      if (rows === 1) firstId = id
      lastId = id
      // object-level conditional-formatting color, if any
      const conditionalColor = (
        node.objects as
          | { color?: { fill?: { solid?: { color?: string } } } }
          | undefined
      )?.color?.fill?.solid?.color
      if (conditionalColor) {
        hashGroupingString(id)
        hashGroupingString(conditionalColor)
      }
      const values = node.values
      if (values) {
        for (const key of Object.keys(values)) {
          if (values[Number(key)]?.highlight != null) {
            highlighted++
            hashHighlightedId(id)
            break
          }
        }
      }
      for (const index of tooltipValueIndexes) {
        const cell = values?.[index]
        if (!cell) {
          hashTooltipString('missing')
          continue
        }
        const value = cell.value
        if (value === null) {
          hashTooltipString('null')
          continue
        }
        hashTooltipString(typeof value)
        hashTooltipString(String(value))
      }
      return
    }
    // grouping node (Color-by parent): raw value + subtree size pin the
    // object→category assignment
    hashGroupingString(String(node.value ?? ''))
    hashGroupingString(String(children.length))
    for (const child of children) walk(child)
  }
  const root = matrix.rows?.root
  if (root?.children) for (const child of root.children) walk(child)
  const highlightedIds = (highlightedIdHash >>> 0).toString(16).padStart(8, '0')
  const tooltipData = (tooltipHash >>> 0).toString(16).padStart(8, '0')
  const grouping = (groupingHash >>> 0).toString(16).padStart(8, '0')
  return `${hasActiveFilters}|${rows}|${highlighted}|${highlightedIds}|${tooltipColumns}|${tooltipData}|${grouping}|${firstId}|${lastId}`
}
