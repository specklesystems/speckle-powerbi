# Speckle 4.0 Power BI — Handover (2026-07-06)

End-to-end refactor of the Power BI connector + 3D visual onto the Speckle 4.0
artifact (parquet) pipeline. This doc is the pickup point for continuing on another machine.

## Branches (both pushed)

| Repo | Branch | What's on it |
|---|---|---|
| `speckle-powerbi` | **`big-truck-star-schema`** | Connector (star-schema output) + visual (viewer 2.0, pure-JS loader). 14 commits ahead of `main`. |
| `speckle-server-internal` | **`oguzhan/powerbi-purejs-loader`** | `SpecklePureJsLoader` in `packages/viewer` (branched off `dim/viewer-dat-job`). One commit `a08abd116`. |

The viewer branch descends from `dim/viewer-dat-job` (the viewer-2.0 / artifact line). Rebase
onto its latest before continuing if dim has moved.

## What works (validated)

### Connector — DONE
- `speckle-powerbi/src/powerbi-data-connector`. Builds a `.mez` (`dotnet msbuild Speckle.proj -t:BuildMez`), auto-copies to `~/Documents/Power BI Desktop/Custom Connectors`.
- Output is a **star-schema navigation table**: `Objects` (object_key, Application ID, Model Info) / `Properties` fact (object_key, path_key, Value Text/Number/Bool + coalesced Value) / `Property Paths` (path_key, Property) + lazy `Flat (Tall)` / `Flat (Wide)` convenience tables.
- Reads `/api/v2/projects/{p}/models/{m}/versions/{v}/artifacts`, downloads eav parquets, joins them. Type params merged instance-wins. Federation namespaces keys `ordinal*2^32`. Legacy (pre-4.0) versions fall back to the old JSON path; the Model Info blob carries `pipeline: "artifact"|"legacy"`.
- **`ManualCredentials = true`** on presigned-S3 fetches (the mashup engine otherwise attaches the OAuth bearer → S3 400 InvalidArgument on ceph/DO Spaces).
- Validated offline with the PQ SDK (`PQTest.exe run-test`) against a real testing2 Revit bundle.

### Visual — data path DONE, 3D blocked in the real Service (see below)
- `speckle-powerbi/src/powerbi-visual`. Vue 3 + Pinia, `@speckle/viewer` consumed via `file:` deps to the local monorepo (`../../../speckle-server-internal/packages/...`) + npm `overrides`.
- Data roles renamed: `modelInfo`, `applicationIds`. Identity is **applicationId** end-to-end (selection/isolation/color/tooltip; hits resolved by walking to the object node's `raw.applicationId`).
- **Dropped duckdb-wasm entirely** — uses `SpecklePureJsLoader` (hyparquet, main-thread; no Web Workers, no OPFS, no wasm). This was the fix for the sandbox fighting duckdb wall-by-wall.

## THE OPEN BLOCKER

**The visual still fails to load in the real Power BI Service** with the sandbox's masked
`Uncaught TypeError: Cannot read properties of undefined (reading 'name')` in
`cvSandboxPack…sendError`. This error is Power BI's OWN error reporter crashing while reporting
*our* real error — so it hides the actual cause.

Crucial context: a **faithful local sandbox sim passes 100% clean** — opaque + `allow-same-origin`
iframe, Power BI's exact CSP, the "isolate wrapper", driven headless with the real testing2 Revit
bundle: construct → update → "Objects loaded", 4914 SGEO meshes decode, ZERO errors. So whatever
still breaks in the *real* Service is something the sim doesn't reproduce.

### Next debugging step (do this first on the Mac)
The real error is masked. Un-mask it:
1. In `src/visual.ts`, the constructor and `update()` are wrapped in try/catch that
   `console.error('Speckle visual: … failed', e)` before rethrowing. **In the Service, filter the
   console by `Speckle visual:`** — if those lines appear, that's the real error (our code). If they
   do NOT appear, the failure is before our code runs (host handshake / bundle transfer / API).
2. If nothing from us appears, add a clean monkey-patch of the sandbox's `sendError` (patch
   `this.plugin`-safe) to log the original error object. (An earlier attempt interfered with a
   registry-proxy diagnostic that has since been removed — a clean standalone patch should be safe.)
3. Suspects the sim can't see: the real host calls visual/host methods the mock host doesn't
   implement; bundle transfer size (~12MB dev bundle) into the sandbox; an API-version handshake
   mismatch (we advertise `pbiviz.json` apiVersion 5.4.0).

### Debugging tooling built this session (recreate on Mac)
Under a scratch dir on Windows (temp, not committed): a headless-Edge CDP driver
(`cdp_console.js`) that loads a page and streams console/exceptions; `harness.html` that loads the
real `visual.js` and drives a full `update()` with a real base64 Model Info blob + applicationIds
and a mock host; `sandbox_full.html` that does the same inside a sandboxed iframe with PBI's exact
CSP + the isolate wrapper (a faithful sandbox replica). This is how the pure-JS loader was
validated without round-tripping through the Service. Recreating these on the Mac (Chrome/Edge
`--headless --remote-debugging-port`, `ws` npm module for CDP) is the fastest inner loop.

## How to set up on the Mac

```
# 1. monorepo (viewer) — needs Tailscale UP (the @speckle npm scope resolves from a
#    private tailnet registry; without it yarn install fails with ENOTFOUND).
cd speckle-server-internal && git checkout oguzhan/powerbi-purejs-loader
yarn install
# build the four packages the visual consumes (eav-queries BEFORE packfile-manager):
for p in shared objectloader2 eav-queries packfile-manager viewer; do yarn workspace @speckle/$p build; done

# 2. visual
cd speckle-powerbi && git checkout big-truck-star-schema
cd src/powerbi-visual && npm install    # file: deps link to the monorepo packages
npm run dev                             # serves https://localhost:8080 (certs in repo)

# 3. connector (optional, to regenerate the .mez)
cd ../powerbi-data-connector && dotnet msbuild Speckle.proj -t:BuildMez
```

Testing the visual: **only the Power BI Service has a live Developer Visual** (Desktop does not —
MS docs are misleading; Desktop only imports a compiled `.pbiviz`). Enable developer mode at
`app.powerbi.com/user/user-settings/developer-settings`, publish a report with the star-schema
data, add the Developer Visual, bind `Application ID` + `Model Info` from the `Objects` table.

## Remaining work after the blocker

- **Offline mode (`internalizeData`)** — port to persist the parquet bundle into the .pbix and feed
  the loader from memory (the pure-JS loader already reads from ArrayBuffers, so this is now
  straightforward — `parseParquet` just needs a "from bytes" path). Task was blocked on the 3D
  path; unblocked once the Service renders.
- **Tree-shake duckdb** — `@speckle/packfile-manager` (duckdb/worker/wasm) is still bundled but
  never executed (dead weight ~ several MB). Remove the `SpecklePackfileLoader2` import path from
  what the visual pulls in so it's dropped.
- **Production packaging** — the compiled single-file `.pbiviz` for AppSource; the alpha viewer
  packages must be published to npm (currently `file:` local deps).
- **Selection/color/tooltip parity** pass once 3D renders.

## Key learnings (so you don't re-discover them)

- **PBI sandbox is hostile to duckdb**: it blocks Web Workers from file://, cross-origin, and its
  own `sources:///` scheme, and denies OPFS. That's why we went pure-JS. Don't go back to duckdb
  in the visual.
- **hyparquet `utf8: false`** is required so the geometries `content` BYTE_ARRAY reads as a
  `Uint8Array` (raw SGEO), not a mangled UTF-8 string. STRING-annotated columns stay strings.
- **The isolate wrapper** runs the visual with `var self = this` = a *cloned* window; anything
  patching globals must reach the *real* global (`Function('return this')()`), not `self`.
- **The `sendError` self-crash** masks every load error — always un-mask before diagnosing.
- **Connector M perf**: never `Table.Pivot`/`ExpandRecordColumn` at 1000+ columns (~12 min); use
  `Table.Group → Record.FromList → Table.FromRecords(records, columns, MissingField.UseNull)` (~10s).
- Full status + decisions also captured in `~/.claude` memory `powerbi-4.0-refactor.md`.
