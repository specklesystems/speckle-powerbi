// Vendored from @speckle/ts-sdk (packages/ts-sdk/src/viewer/boot.ts, speckle-server-internal@speckle/next).
// @speckle/ts-sdk is private/unpublished; keep this copy in sync until it ships.
/**
 * The renderer-importing half of the viewer tier. Loaded via dynamic import
 * from `createViewer`'s ready chain, so `@speckle/viewer-webgpu` (and its GPU
 * machinery) never enters the module graph of data-only consumers.
 */
import { createRenderer } from '@speckle/viewer-webgpu'
import { installCameraControls } from '@speckle/viewer-tools'
import type { Emitter, Renderer } from '@speckle/viewer-webgpu'
import type { BridgeEmitter } from './bridge.js'
import type { ObjectGroup, ViewerModelMaps } from './objects/types.js'

/** Vendored from @speckle/ts-sdk viewer-state/state.ts (the one type this module needs). */
export interface ViewerCameraState {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
  projection: 'perspective' | 'orthographic'
}

/**
 * Minimal structural views of threejs-math's Sphere/Box3 — only the members
 * this module touches. The renderer's own re-exported Box3/Sphere types are
 * unusable for consumers: its dist d.ts references threejs-math via a
 * relative node_modules path that only resolves inside the viewer repo
 * (upstream packaging bug), so the real classes arrive error-typed here and
 * the casts below re-anchor them.
 */
interface SphereLike {
  center: Vector3Like
  radius: number
  clone(): SphereLike
}
interface Box3Like {
  union(other: Box3Like): Box3Like
  getBoundingSphere(target: SphereLike): SphereLike
}
interface Vector3Like {
  x: number
  y: number
  z: number
}
interface CameraLike {
  eye: Vector3Like
  target: Vector3Like
  fov: number
  projection: 'perspective' | 'orthographic'
}

export interface BootRendererOptions {
  restrictKeyInput?: boolean
}

export const bootRenderer = async (
  canvas: HTMLCanvasElement,
  emitter: BridgeEmitter,
  options: BootRendererOptions
): Promise<Renderer> => {
  // BridgeEmitter is runtime-compatible with the renderer's Emitter (same
  // on/off/emit/clear API); the cast bridges its nominal (private-field)
  // typing — see BridgeEmitter's doc comment.
  const renderer = await createRenderer(canvas, {
    emitter: emitter as unknown as Emitter,
    restrictKeyInput: options.restrictKeyInput
  })
  // The viewer ships no camera controller since the CameraRig seam (viewer PR #98):
  // bare createRenderer renders a static camera. Install the standard controller —
  // wires the nav-anchor picks, Hi-Z fly speed, and keyboard through public API.
  installCameraControls(renderer)
  return renderer
}

// ── camera state (the envelope's camera seam) ────────────────────────────────

export const cameraStateOf = (renderer: Renderer): ViewerCameraState => {
  // Structural view over the camera: eye/target are threejs-math Vector3s,
  // whose types arrive broken (see the note above).
  const camera = renderer.getCamera() as unknown as CameraLike
  return {
    position: [camera.eye.x, camera.eye.y, camera.eye.z],
    target: [camera.target.x, camera.target.y, camera.target.z],
    fov: camera.fov,
    projection: camera.projection
  }
}

export const applyCameraState = (
  renderer: Renderer,
  state: ViewerCameraState
): void => {
  renderer.setProjection(state.projection)
  const controls = renderer.getCameraRig()
  controls.setFieldOfView(state.fov)
  // fromPositionAndTarget takes WORLD-space coordinates (it converts to the
  // controls' Y-up spherical basis internally) and only reads x/y/z off its
  // arguments — plain objects satisfy the Vector3 parameters at runtime; the
  // cast bridges the nominal typing (see the threejs-math note above).
  const [px, py, pz] = state.position
  const [tx, ty, tz] = state.target
  type WorldPoint = Parameters<
    ReturnType<Renderer['getCameraRig']>['fromPositionAndTarget']
  >[0]
  controls.fromPositionAndTarget(
    { x: px, y: py, z: pz } as WorldPoint,
    { x: tx, y: ty, z: tz } as WorldPoint
  )
}

export const setProjection = (
  renderer: Renderer,
  mode: 'perspective' | 'orthographic'
): void => {
  renderer.setProjection(mode)
}

/** The five axis-aligned viewpoints, in Speckle's Z-up world. */
export type CanonicalView = 'top' | 'front' | 'left' | 'back' | 'right'

// Unit eye offset from the scene center per view. "Front" looks north (+Y)
// from south of the model — the classic viewer's convention.
const CANONICAL_DIRECTIONS: Record<CanonicalView, readonly [number, number, number]> = {
  top: [0, 0, 1],
  front: [0, -1, 0],
  back: [0, 1, 0],
  left: [-1, 0, 0],
  right: [1, 0, 0]
}

/**
 * Point the camera at the scene from a canonical direction, framing the whole
 * scene: orientation via `fromPositionAndTarget`, then `fitToSphere` for the
 * exact distance (the same supported drive `zoomToObjects` uses).
 */
export const setCanonicalView = (renderer: Renderer, view: CanonicalView): void => {
  const controls = renderer.getCameraRig()
  const sphere = renderer.scene.getBoundingSphere() as unknown as SphereLike
  const { center } = sphere
  const distance = sphere.radius > 0 ? sphere.radius * 2 : 1
  const [dx, dy, dz] = CANONICAL_DIRECTIONS[view]
  type WorldPoint = Parameters<
    ReturnType<Renderer['getCameraRig']>['fromPositionAndTarget']
  >[0]
  controls.fromPositionAndTarget(
    {
      x: center.x + dx * distance,
      y: center.y + dy * distance,
      z: center.z + dz * distance
    } as WorldPoint,
    { x: center.x, y: center.y, z: center.z } as WorldPoint
  )
  if (sphere.radius > 0) controls.fitToSphere(sphere)
}

/**
 * Fly the camera to frame the given object groups (the whole scene when none
 * given). Objects expand to placements via the CSR maps, then their merged
 * bounds feed `controls.fitToSphere` — the supported programmatic camera
 * drive. Groups whose model isn't loaded (or whose objects have no geometry)
 * contribute nothing; if nothing contributes, the camera stays put.
 *
 * `getModelMaps` is passed in (the bridge's) rather than read off the
 * renderer: viewer-webgpu dropped its own accessor in 2026.8.31 and the host
 * now owns the maps.
 */
export const zoomToObjects = (
  renderer: Renderer,
  getModelMaps: (modelId: string) => ViewerModelMaps | null,
  groups?: ObjectGroup[]
): void => {
  const controls = renderer.getCameraRig()
  if (!groups || groups.length === 0) {
    controls.fitToSphere(renderer.scene.getBoundingSphere())
    return
  }
  let bounds: Box3Like | null = null
  for (const group of groups) {
    const maps = getModelMaps(group.modelId)
    if (!maps) continue
    const { offsets, placements: csrPlacements } = maps.objectCsr
    const placements: number[] = []
    for (const objectIndex of group.objectIndexes) {
      const start = offsets[objectIndex]
      const end = offsets[objectIndex + 1]
      if (start === undefined || end === undefined) continue
      for (let p = start; p < end; p++) {
        const placement = csrPlacements[p]
        if (placement !== undefined) placements.push(placement)
      }
    }
    if (placements.length === 0) continue
    const box = renderer.scene.getBoundsForPlacements(placements) as unknown as Box3Like
    bounds = bounds ? bounds.union(box) : box
  }
  if (!bounds) return
  // A real Sphere instance to write the result into, without importing the
  // class: clone the scene's own (threejs-math constructs it renderer-side).
  const target = (renderer.scene.getBoundingSphere() as unknown as SphereLike).clone()
  const sphere = bounds.getBoundingSphere(target)
  if (sphere.radius > 0) controls.fitToSphere(sphere)
}
