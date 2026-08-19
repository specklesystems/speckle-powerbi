/**
 * Cheap identity of a data update: row universe + highlight state. Persist-property
 * round-trips re-send identical data every few seconds, so callers can use this
 * signature to avoid reprocessing an already-settled matrix.
 */
export const matrixSignature = (
  matrix: powerbi.DataViewMatrix,
  hasActiveFilters: boolean
): string => {
  let rows = 0
  let highlighted = 0
  let highlightedIdHash = 0x811c9dc5
  let firstId = ''
  let lastId = ''

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
      return
    }
    for (const child of children) walk(child)
  }
  const root = matrix.rows?.root
  if (root?.children) for (const child of root.children) walk(child)
  const highlightedIds = (highlightedIdHash >>> 0).toString(16).padStart(8, '0')
  return `${hasActiveFilters}|${rows}|${highlighted}|${highlightedIds}|${firstId}|${lastId}`
}
