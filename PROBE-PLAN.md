# scratch/duckdb-probe — staged duckdb rematch (throwaway branch)

Goal: instead of debugging the full 12 MB visual downward, bisect upward from a
minimal visual that provably renders in the Power BI Service iframe, adding one
duckdb-pipeline layer at a time until it breaks. `SpecklePureJsLoader` is out of
scope on this branch.

## Stage 0 — capability probe (CURRENT)

`src/powerbi-visual/src/probe/probeVisual.ts` — a 39 KB dependency-free visual
(no Vue, no viewer). Renders a diagnostic panel in the iframe and probes every
capability the duckdb pipeline needs:

- workers: blob-classic, data-URL, blob-module (`{type:'module'}` — what
  packfile-manager's TabClient spawns), nested worker-in-worker (duckdb's
  topology), wasm-compile inside a worker
- OPFS: main-thread writable + `createSyncAccessHandle` in a worker
  (SpecklePackfileLoader2 streams parquets into OPFS)
- Web Locks, localStorage, wasm on main thread, CSP-violation listener,
  window.onerror/unhandledrejection traps
- live data path: decodes the bound Model Info, lists the artifacts endpoint,
  range-reads the first presigned parquet URL

Build selection: `webpack.config.base.ts` bundles the probe by default on this
branch; `PROBE=0 npm run build:dev` builds the real visual.

Local validation (both pass as expected):
- plain page: all 11 probes green
- opaque sandboxed iframe (no `allow-same-origin`): visual survives, red rows
  for blob-module worker, OPFS (both), Web Locks, localStorage/caches —
  classic/nested/data-URL workers and wasm still green

Harness lives in the session scratchpad (`probe-harness/`): `harness.html`,
`sandbox.html`, `cdp_console.js` (headless-Chrome CDP console/panel dumper,
reuses `ws` from the visual's node_modules).

Service round-trip: `npm run dev`, open the developer-mode report at
app.powerbi.com, add the Developer Visual, bind Application ID + Model Info,
read the panel (works even with nothing bound — data rows just stay empty).

## Stage 0 RESULTS (2026-07-06, real Service, sandbox build 13.0.28507.472)

**THE ORIGINAL MASKED BLOCKER IS SOLVED.** The Developer Visual host resolves
the visual via the webpack library global `window["<guid>_DEBUG"].default` —
it never consults `powerbi.visuals.plugins` (verified via registry Proxy: zero
lookups). Our `output.library` was the plain guid, the host read `undefined`,
and its own `sendError` crashed reporting it ("reading 'name'"). Fixed in
webpack.config.base.ts by appending `_DEBUG` in dev builds. Three earlier
candidate causes cleared along the way: module-scope `Function('return this')`
(eval IS allowed in this sandbox), plugins-registry registration (fine),
`window.powerbi` availability (present on all globals, all the same object).

Wall-map from the live sandbox (probe panel):
- ✅ wasm main-thread + in-worker, blob-classic / data-URL / NESTED workers,
  fetch to the dev server, eval, crypto.randomUUID, indexedDB present
- ❌ module (`type:'module'`) blob workers ("Refused to cross-origin redirects
  of the top-level worker script"), OPFS main (SecurityError, no
  allow-same-origin) AND in-worker (`navigator.storage` undefined), Web Locks,
  localStorage, caches
- iframe: app.powerbi.com cshtml document, opaque ("null") effective origin —
  same-origin fetches of own document CORS-fail

## Stage 1 — worker transport + storage fixes (in packfile-manager)

Confirmed needs from the wall-map:
1. TabClient `new Worker(new URL('./duckdbWorker.js', import.meta.url),
   {type:'module'})` → classic blob worker with inlined code (resurrect the
   `322fecb` blob/data-URL machinery — classic+nested workers verified green).
2. OPFS is dead in the Service sandbox → the loader/duckdb must run fully
   in-memory (`registerFileBuffer` instead of OPFS streaming).
3. `navigator.locks` → no-op fallback when unavailable.
Open unknown: CORS on the presigned S3 parquet URLs from the sandbox's null
origin — bind Model Info in the probe report to run the artifacts +
presigned-range-read rows.

## Stage 2 — duckdb boot

Add a probe row that imports `@speckle/packfile-manager`, boots the TabClient/
duckdb-wasm (wasm assets served via dev-server `?url` asset rule + aliases
already in webpack.config.base.ts), and runs `SELECT 1`. Bundle grows — this
also isolates the "12 MB transfer" suspect.

## Stage 3 — storage layer

SpecklePackfileLoader2 needs OPFS + Web Locks. If stage-0 shows them denied in
the Service, the loader needs an in-memory fallback (duckdb
`registerFileBuffer` instead of OPFS streaming) — patch in
speckle-server-internal `packages/packfile-manager` / viewer loader.

## Stage 4 — full pipeline

Viewer + `SpecklePackfileLoader2` render of the bound model, then fold the
findings back into the real visual (`src/visual.ts`) and delete this branch.
