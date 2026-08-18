# The duckdb rematch — debugging chronicle + sandbox probe

**OUTCOME (2026-07-06): WON.** The real visual runs `SpecklePackfileLoader2`
(duckdb-wasm, forced in-memory) in the live Power BI Service: full render,
cross-visual filtering, selection, camera persistence. Everything below is the
staged bisect that got there, kept as reference. The probe visual remains a
permanent diagnostic tool: `PROBE=1 npm run dev` serves it instead of the real
visual — capability wall-map rows + minimal render/selection harness behind a
🔬 debug button.

Original goal: instead of debugging the full 12 MB visual downward, bisect
upward from a minimal visual that provably renders in the Power BI Service
iframe, adding one duckdb-pipeline layer at a time until it breaks.

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
app.powerbi.com, add the Developer Visual, relate `Objects[model_key]` to
`Models[model_key]` (usually autodetected), bind `Models[Model Info]` (the
top-level rows grouping) plus an Objects identifier (`Objects[object_key]` or
`Objects[Application ID]`), read the panel (works even with nothing bound —
data rows just stay empty).

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

## Stage 1 — worker transport + storage fixes — DONE (local)

Data-path rows all green in the Service (artifacts list via bearer, presigned
S3 range-read HTTP 206 "PAR1" from the null origin — no bucket-CORS problem).

Implemented:
1. `duckdbWorkerShim.ts` resurrected from `322fecb` + strips `{type:'module'}`
   when blob-ifying (module blob workers are blocked in the Service, classic
   pass). Imported FIRST by the probe. Webpack rules: duckdb-browser worker
   `?url` → data: inline; wasm `?url` → absolute-URL asset.
2. packfile-manager sandbox mode (branch `oguzhan/powerbi-purejs-loader`,
   commits af370d870 + c4911bd9a): OPFS spill probed FUNCTIONALLY with
   in-memory fallback (the data:-inlined inner engine worker has an opaque
   origin — OPFS is denied there even outside PBI); locks SecurityError
   swallowed; `registerFileBuffer` idempotent; new
   `attachParquetBundleFromBuffers` + `readGeometryBlobs(raw)` + `dropFile`.
3. Probe rows: `duckdb-boot` (engine up + SELECT 42 — passes locally through
   the full shim chain) and `duckdb-bundle` (download all parquets in-memory,
   register buffers, attach views, count objects, read raw SGEO page).

## Stage 2 — duckdb in the live Service sandbox — DONE ✅

Round 6 (after fixing chunkFilename: the PBI plugin embeds the LAST *.js
asset as the visual, so the worker chunk had clobbered visual.js → emit
chunks as .mjs): **all rows green in the real Service** —
`duckdb-boot: SELECT 42 -> 42` and
`duckdb-bundle: 13 parquets (7.5MB) in-memory, 12 views attached,
objects=6697, 50 geometry blobs read (type=mesh, magic="SGEO") — 5.0s`.
duckdb-wasm is fully operational inside the Power BI sandbox.

## Stage 3 — real loader + viewer render (CURRENT)

- `SpecklePackfileLoader2` gained an in-memory mode (viewer commit
  2832e1c75): auto-detected functional-OPFS or forced via 5th ctor arg;
  fetch→registerFileBuffer→attachParquetBundleFromBuffers→
  readGeometryBlobs(raw)→dropFile.
- Probe row `viewer-render`: creates a real Viewer in the panel and loads the
  bound model through the real loader (forced in-memory).
- Real visual updated for PROBE=0: visual.ts imports duckdbWorkerShim first;
  plugins/viewer.ts uses SpecklePackfileLoader2 (in-memory) instead of
  SpecklePureJsLoader.

## Stage 4 — the real visual in the Service

`PROBE=0 npm run dev` and re-run the Developer Visual: full Vue UI +
selection/color/tooltip against the duckdb loader. Then fold the branch
learnings back: cherry-pick the webpack fixes (library _DEBUG suffix,
chunkFilename .mjs, ?url rules) onto big-truck-star-schema.

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
