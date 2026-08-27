/**
 * Compatibility types for code written against the legacy `@speckle/viewer` (three.js) API.
 * The viewer-3 rewrite removed that package; the UI layer (menus, store, settings) still
 * speaks these vocabularies, so they live on here as plain types until those surfaces are
 * redesigned for viewer 3.
 */

/** Mirror of the legacy viewer's ViewMode enum (persisted as a number in the .pbix). */
export enum ViewMode {
  DEFAULT,
  SOLID,
  PEN,
  ARCTIC,
  SHADED
}

/** The five axis-aligned viewpoints (superset-compatible with the legacy CanonicalView). */
export type CanonicalView = 'top' | 'front' | 'left' | 'back' | 'right'

/** Named scene view from the object graph — always empty on the artifact path; kept so
 *  the views menu compiles. */
export interface SpeckleView {
  name: string
  id: string
  origin?: { x: number; y: number; z: number }
  target?: { x: number; y: number; z: number }
}

/** Minimal mirror of the legacy SunLightConfiguration (lighting settings persistence). */
export interface SunLightConfiguration {
  enabled?: boolean
  castShadow?: boolean
  intensity?: number
  color?: number
  elevation?: number
  azimuth?: number
  radius?: number
  indirectLightIntensity?: number
  shadowcatcher?: boolean
}

/** Plain {x,y,z} — replaces three's Vector3 in store signatures (only .x/.y/.z are read). */
export interface Vector3Like {
  x: number
  y: number
  z: number
}
