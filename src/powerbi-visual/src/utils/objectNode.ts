import type { TreeNode } from '@speckle/viewer'

/**
 * Viewer 2.0 hit-tests land on mesh render nodes (synthetic ids like
 * "geom_{K}~{n}"), with transform nodes between the mesh and the object node.
 * The object node is the first ancestor carrying raw.applicationId — that id is
 * the stable object handle shared with the data connector's "Application ID"
 * column.
 */
export function resolveObjectNode(node: TreeNode | null): TreeNode | null {
  let current: TreeNode | null = node
  while (current) {
    const raw = current.model?.raw as Record<string, unknown> | undefined
    const appId = raw?.applicationId
    if (typeof appId === 'string' && appId.length > 0) return current
    current = current.parent
  }
  return null
}

export function applicationIdOf(node: TreeNode | null): string | null {
  const objectNode = resolveObjectNode(node)
  if (!objectNode) return null
  return (objectNode.model.raw as Record<string, unknown>).applicationId as string
}
