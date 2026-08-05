// Vendored from @speckle/ts-sdk (packages/ts-sdk/src/viewer/objects/index.ts, speckle-server-internal@speckle/next).
// @speckle/ts-sdk is private/unpublished; keep this copy in sync until it ships.
/**
 * viewer/objects — the interactions layer (formerly @speckle/viewer-interactions)
 *
 * The batteries-included interaction layer for the WebGPU Speckle viewer:
 * selection and visibility (hide/isolate) with undo/redo, self-wired to a
 * renderer instance's events and driving its placement API directly. The one
 * dependency is that renderer handle (see ViewerHandle in types.ts — a
 * structural seam @speckle/viewer-webgpu's Renderer satisfies); consumers —
 * this repo's frontend or third parties embedding the viewer in any
 * framework — construct the layer with it, then issue commands and subscribe
 * to an immutable snapshot. No further wiring, no framework coupling. See
 * types.ts for the full contract.
 */
export { createViewerInteractions } from './interactions.js'
export {
  colorGroupsToMap,
  filterContainment,
  hiddenContainment,
  isHidden,
  isIsolated,
  isolationContainment,
  modelContainmentOf,
  modelHiddenContainment,
  modelIsolationContainment,
  refsToGroups,
  type ColorGroup,
  type Containment,
  type ModelObjectColors
} from './state.js'
export type {
  InteractionsSnapshot,
  ObjectGroup,
  ObjectRef,
  ViewerHandle,
  ViewerInteractions,
  ViewerInteractionsOptions,
  ViewerModelMaps
} from './types.js'
