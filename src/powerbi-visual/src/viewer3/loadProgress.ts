// Vendored from @speckle/ts-sdk (packages/ts-sdk/src/viewer/loadProgress.ts, speckle-server-internal@speckle/next).
// @speckle/ts-sdk is private/unpublished; keep this copy in sync until it ships.
/**
 * Typed load-progress channel for `viewer.load()`. One event stream per load call, emitted in
 * phase order. Numbers are honest or absent: determinate byte totals only where a true
 * denominator exists (`bytesTotal: null` otherwise — render an indeterminate bar), and there is
 * deliberately NO overall percentage: out-of-core streaming means the scene is never "100%
 * loaded" (geometry keeps streaming/evicting under residencyFraction after `interactive`).
 *
 * Phase meanings:
 * - `resolving`     version metadata + artifacts list fetches.
 * - `preparing`     the geometry-stream server is copying a cold artifact into place before it
 *                   can serve the first byte (minutes for whale-class models). Compressed
 *                   bytes; `bytesTotal: null` = unknown.
 * - `index`         the `.viewer.idx` (or whole-file pre-warm) download; determinate when the
 *                   server exposes an uncompressed byte total.
 * - `painting`      geometry is streaming into the first frame — the canvas itself is the
 *                   progress; subscribe `viewer.on('viewer:geomLoadStats')` for a MB/s ticker.
 * - `downloading`   background `.dat` acquisition into OPFS (the hybrid cache fill). Starts
 *                   only after first-paint streaming quiesces so it never competes with the
 *                   interactive socket for bandwidth.
 * - `attaching`     the data-plane (DuckDB) attach for interactions/queries.
 * - `interactive`   scene is usable; `backgroundDownloading` says whether acquisition continues.
 */
export type LoadProgress =
  | { phase: 'resolving' }
  | { phase: 'preparing'; bytesLoaded: number; bytesTotal: number | null }
  | { phase: 'index'; bytesLoaded: number; bytesTotal: number | null }
  | { phase: 'painting'; transport: 'remote' | 'local' }
  | { phase: 'downloading'; bytesLoaded: number; bytesTotal: number | null }
  | { phase: 'attaching' }
  | { phase: 'interactive'; backgroundDownloading: boolean }

export type OnLoadProgress = (progress: LoadProgress) => void
