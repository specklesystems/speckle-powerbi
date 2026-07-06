/**
 * Stage-0 probe visual (scratch/duckdb-probe branch — throwaway).
 *
 * A dependency-free visual (no Vue, no viewer, no loaders) that renders a
 * diagnostic panel INSIDE the Power BI sandbox iframe and probes every
 * capability the duckdb loading pipeline needs, so one Service round-trip
 * tells us exactly which wall it hits first:
 *
 *   - worker spawning: blob / data-URL / module / nested (duckdb = nested
 *     module workers)
 *   - wasm compile on the main thread and inside a worker
 *   - OPFS: main-thread writable + createSyncAccessHandle in a worker
 *     (SpecklePackfileLoader2 streams parquets into OPFS)
 *   - Web Locks, crypto.randomUUID, SharedArrayBuffer, storage
 *   - CSP violations (listener renders them as rows — no masked errors)
 *   - live data path: decodes the bound Model Info blob, lists the artifacts
 *     endpoint and range-reads the first presigned parquet URL
 *
 * Everything is caught and rendered in-panel; nothing intentionally throws
 * into the host, so the sandbox's crash-prone sendError reporter never runs.
 */
import '../duckdbWorkerShim' // MUST be first: patches global Worker before any duckdb code
import './probe.css'
import powerbi from 'powerbi-visuals-api'
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions
import IVisual = powerbi.extensibility.visual.IVisual
import DataViewMatrixNode = powerbi.DataViewMatrixNode

const PROBE_TIMEOUT_MS = 5000
const LOG_PREFIX = 'Speckle probe:'

// first executable statement: if this banner shows in the console but nothing
// else does, module evaluation died between here and the class definition
try {
  console.log(LOG_PREFIX, 'module evaluating')
} catch {
  /* not even console — nothing to do */
}

// the isolate wrapper runs the visual with `self`/`window` bound to a CLONED
// window; event listeners and globals must reach the real one. The Function
// constructor is eval under CSP — a sandbox without 'unsafe-eval' throws right
// here, so it MUST be guarded (an unguarded throw at module scope kills plugin
// registration and surfaces as the host's masked sendError crash).
let evalAllowed = false
const realGlobal = ((): typeof globalThis & Window => {
  try {
    const g = Function('return this')() as typeof globalThis & Window
    evalAllowed = true
    return g
  } catch {
    /* CSP without unsafe-eval */
  }
  if (typeof globalThis !== 'undefined') return globalThis as typeof globalThis & Window
  return window as typeof globalThis & Window
})()

type ProbeStatus = 'pending' | 'ok' | 'fail' | 'info'

interface ProbeRow {
  el: HTMLElement
  statusEl: HTMLElement
  detailEl: HTMLElement
}

const WASM_EMPTY_MODULE = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]

const errMsg = (e: unknown): string =>
  e instanceof Error ? `${e.name}: ${e.message}` : String(e)

const withTimeout = <T>(p: Promise<T>, label: string, ms = PROBE_TIMEOUT_MS): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: timeout after ${ms}ms`)), ms)
    )
  ])

/** Spawns a worker from source text and resolves with its first message. */
const workerEcho = (
  source: string,
  urlKind: 'blob' | 'data',
  options?: WorkerOptions,
  payload: unknown = 'ping'
): Promise<string> =>
  withTimeout(
    new Promise<string>((resolve, reject) => {
      let url: string
      try {
        url =
          urlKind === 'blob'
            ? URL.createObjectURL(new Blob([source], { type: 'application/javascript' }))
            : 'data:application/javascript,' + encodeURIComponent(source)
        const worker = new Worker(url, options)
        worker.onmessage = (e) => {
          resolve(String(e.data))
          worker.terminate()
        }
        worker.onerror = (e) =>
          reject(new Error(`worker error: ${e.message || 'no message (likely CSP/load block)'}`))
        worker.postMessage(payload)
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    }),
    'worker'
  )

const ECHO_WORKER = `self.onmessage = function (e) { self.postMessage('pong:' + e.data) }`

const WASM_WORKER = `self.onmessage = async function () {
  try {
    await WebAssembly.instantiate(new Uint8Array([${WASM_EMPTY_MODULE.join(',')}]))
    self.postMessage('wasm-in-worker ok')
  } catch (e) { self.postMessage('FAIL ' + (e && e.message)) }
}`

const OPFS_SYNC_WORKER = `self.onmessage = async function () {
  try {
    const root = await navigator.storage.getDirectory()
    const fh = await root.getFileHandle('speckle-probe-sync.bin', { create: true })
    const ah = await fh.createSyncAccessHandle()
    ah.write(new Uint8Array([1, 2, 3]))
    ah.flush()
    ah.close()
    await root.removeEntry('speckle-probe-sync.bin')
    self.postMessage('opfs sync-access ok')
  } catch (e) { self.postMessage('FAIL ' + (e && e.message)) }
}`

// outer worker spawns an inner blob worker and relays its echo — duckdb's
// topology (tabClient worker -> duckdb-browser worker)
const NESTED_WORKER = `
const innerSrc = ${JSON.stringify(ECHO_WORKER)}
self.onmessage = function (e) {
  let inner
  try {
    const url = URL.createObjectURL(new Blob([innerSrc], { type: 'application/javascript' }))
    inner = new Worker(url)
  } catch (err) {
    self.postMessage('FAIL spawn: ' + (err && err.message))
    return
  }
  inner.onmessage = function (ie) { self.postMessage('nested-' + ie.data) }
  inner.onerror = function (ie) { self.postMessage('FAIL inner: ' + (ie.message || 'load blocked')) }
  inner.postMessage(e.data)
}`

interface DecodedModelInfoLite {
  server?: string
  projectId?: string
  modelId?: string
  versionId?: string
  token?: string
  pipeline?: string
  schemaVersion?: number
}

export class Visual implements IVisual {
  private panel!: HTMLElement
  private rowsContainer!: HTMLElement
  private updatesEl!: HTMLElement
  private updateCount = 0
  private dataProbeRan = false
  private constructedAt = performance.now()

  constructor(options: VisualConstructorOptions) {
    try {
      this.buildPanel(options.element)
      this.installErrorTraps()
      this.reportEnvironment()
      void this.runCapabilityProbes()
      this.log('constructor completed')
    } catch (e) {
      // last resort: never let the constructor throw into sendError
      this.log('constructor FAILED', e)
      try {
        options.element.textContent = `Speckle probe constructor failed: ${errMsg(e)}`
      } catch {
        /* nothing left to render into */
      }
    }
  }

  public update(options: VisualUpdateOptions): void {
    try {
      this.updateCount++
      const dv = options.dataViews && options.dataViews[0]
      const summary =
        `#${this.updateCount} type=${options.type} ` +
        `viewport=${Math.round(options.viewport?.width ?? 0)}x${Math.round(
          options.viewport?.height ?? 0
        )} dataViews=${options.dataViews?.length ?? 0}` +
        (dv?.matrix ? ' matrix=yes' : ' matrix=no')
      this.updatesEl.textContent = summary
      this.log('update', summary)

      if (dv?.matrix && !this.dataProbeRan) {
        const modelInfoRaw = this.findModelInfoValue(dv)
        if (modelInfoRaw) {
          this.dataProbeRan = true
          void this.runDataProbes(modelInfoRaw)
        } else {
          this.addRow('model-info', 'info', 'matrix present but no Model Info value found yet')
        }
      }
    } catch (e) {
      this.log('update FAILED', e)
      this.addRow('update-error', 'fail', errMsg(e))
    }
  }

  public destroy(): void {
    this.log('destroy called')
  }

  /* ---------------------------------------------------------------- panel */

  private buildPanel(parent: HTMLElement) {
    this.panel = document.createElement('div')
    this.panel.style.cssText =
      'position:absolute;inset:0;overflow:auto;background:#0d1117;color:#e6edf3;' +
      'font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:10px;box-sizing:border-box'

    const title = document.createElement('div')
    title.textContent = '🔬 Speckle sandbox probe — stage 0'
    title.style.cssText = 'font-weight:bold;font-size:13px;margin-bottom:2px;color:#58a6ff'
    this.panel.appendChild(title)

    this.updatesEl = document.createElement('div')
    this.updatesEl.textContent = 'no update() yet'
    this.updatesEl.style.cssText = 'color:#8b949e;margin-bottom:8px'
    this.panel.appendChild(this.updatesEl)

    this.rowsContainer = document.createElement('div')
    this.panel.appendChild(this.rowsContainer)

    parent.appendChild(this.panel)
  }

  private addRow(name: string, status: ProbeStatus, detail: string): ProbeRow {
    const el = document.createElement('div')
    el.style.cssText =
      'display:flex;gap:8px;padding:2px 0;border-bottom:1px solid #21262d;align-items:baseline'

    const statusEl = document.createElement('span')
    statusEl.style.cssText = 'flex:0 0 14px'

    const nameEl = document.createElement('span')
    nameEl.textContent = name
    nameEl.style.cssText = 'flex:0 0 150px;color:#d2a8ff'

    const detailEl = document.createElement('span')
    detailEl.style.cssText = 'flex:1;word-break:break-all;white-space:pre-wrap'

    el.append(statusEl, nameEl, detailEl)
    this.rowsContainer.appendChild(el)

    const row: ProbeRow = { el, statusEl, detailEl }
    this.setRow(row, status, detail)
    this.log(`${name} [${status}] ${detail}`)
    return row
  }

  private setRow(row: ProbeRow, status: ProbeStatus, detail: string) {
    const icons: Record<ProbeStatus, string> = { pending: '⏳', ok: '✅', fail: '❌', info: 'ℹ️' }
    row.statusEl.textContent = icons[status]
    row.detailEl.textContent = detail
    row.detailEl.style.color = status === 'fail' ? '#ff7b72' : status === 'ok' ? '#7ee787' : '#e6edf3'
  }

  private log(...args: unknown[]) {
    console.log(LOG_PREFIX, ...args)
  }

  /* ---------------------------------------------------------- error traps */

  private installErrorTraps() {
    try {
      realGlobal.addEventListener('error', (e: ErrorEvent) => {
        this.addRow('window.onerror', 'fail', `${e.message} @ ${e.filename}:${e.lineno}`)
      })
      realGlobal.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
        this.addRow('unhandled-rejection', 'fail', errMsg(e.reason))
      })
      document.addEventListener('securitypolicyviolation', (e: SecurityPolicyViolationEvent) => {
        this.addRow(
          'csp-violation',
          'fail',
          `${e.violatedDirective} blocked ${e.blockedURI || '(inline/eval)'}`
        )
      })
    } catch (e) {
      this.addRow('error-traps', 'fail', errMsg(e))
    }
  }

  /* ---------------------------------------------------------- environment */

  private reportEnvironment() {
    // in an opaque-origin sandbox even READING some window properties throws
    // (e.g. caches, localStorage) — every access gets its own guard
    const safe = (fn: () => unknown): string => {
      try {
        const v = fn()
        return v ? 'yes' : 'NO'
      } catch (e) {
        return `THROWS(${e instanceof Error ? e.name : 'err'})`
      }
    }
    const safeStr = (fn: () => string): string => {
      try {
        return fn()
      } catch (e) {
        return `THROWS: ${errMsg(e)}`
      }
    }

    this.addRow('location', 'info', safeStr(() => location.href))
    this.addRow(
      'origin',
      'info',
      safeStr(() => `${location.origin} baseURI=${document.baseURI}`)
    )
    this.addRow(
      'context',
      'info',
      `secureContext=${safe(() => realGlobal.isSecureContext)} ` +
        `inIframe=${safe(() => realGlobal.top !== realGlobal.self)} ` +
        `isolateClone=${safe(() => (self as unknown) !== (realGlobal as unknown))} ` +
        `evalAllowed=${evalAllowed ? 'yes' : 'NO (CSP blocks Function/eval)'}`
    )
    this.addRow(
      'apis',
      'info',
      [
        `Worker=${safe(() => realGlobal.Worker)}`,
        `WebAssembly=${safe(() => realGlobal.WebAssembly)}`,
        `SharedArrayBuffer=${safe(
          () => (realGlobal as unknown as Record<string, unknown>).SharedArrayBuffer
        )}`,
        `navigator.storage=${safe(() => navigator.storage && navigator.storage.getDirectory)}`,
        `navigator.locks=${safe(() => navigator.locks)}`,
        `crypto.randomUUID=${safe(() => crypto && 'randomUUID' in crypto)}`,
        `indexedDB=${safe(() => realGlobal.indexedDB)}`,
        `caches=${safe(() => (realGlobal as unknown as Record<string, unknown>).caches)}`
      ].join(' ')
    )
    try {
      realGlobal.localStorage.setItem('speckle-probe', '1')
      realGlobal.localStorage.removeItem('speckle-probe')
      this.addRow('localStorage', 'ok', 'read/write ok')
    } catch (e) {
      this.addRow('localStorage', 'fail', errMsg(e))
    }
  }

  /* ---------------------------------------------------- capability probes */

  private async runCapabilityProbes() {
    await this.probe('wasm-main-thread', async () => {
      await withTimeout(
        WebAssembly.instantiate(new Uint8Array(WASM_EMPTY_MODULE)),
        'wasm'
      )
      return 'compile+instantiate ok'
    })

    await this.probe('worker-blob-classic', () => workerEcho(ECHO_WORKER, 'blob'))
    await this.probe('worker-data-url', () => workerEcho(ECHO_WORKER, 'data'))
    await this.probe('worker-blob-module', () =>
      workerEcho(ECHO_WORKER, 'blob', { type: 'module' })
    )
    await this.probe('worker-nested', () => workerEcho(NESTED_WORKER, 'blob'))
    await this.probe('worker-wasm', () => workerEcho(WASM_WORKER, 'blob'))
    await this.probe('worker-opfs-sync', () => workerEcho(OPFS_SYNC_WORKER, 'blob'))

    await this.probe('opfs-main-thread', async () => {
      const root = await withTimeout(navigator.storage.getDirectory(), 'opfs')
      const fh = await root.getFileHandle('speckle-probe.bin', { create: true })
      const writable = await fh.createWritable()
      await writable.write(new Uint8Array([1, 2, 3]))
      await writable.close()
      const size = (await fh.getFile()).size
      await root.removeEntry('speckle-probe.bin')
      return `write/read ok (${size} bytes)`
    })

    await this.probe('web-locks', async () => {
      const out = await withTimeout(
        navigator.locks.request('speckle-probe', async () => 'acquired'),
        'locks'
      )
      return String(out)
    })

    await this.probe('fetch-dev-server', async () => {
      const resp = await withTimeout(
        fetch('https://localhost:8080/assets/visual.css', { method: 'HEAD', mode: 'cors' }),
        'fetch'
      )
      return `HTTP ${resp.status}`
    })

    // ── stage 1: the duckdb engine itself, through the worker shim ──────────
    // dynamic import so a bundling/eval problem in the duckdb subtree can't
    // kill the probe module — it fails as a red row instead
    await this.probe('duckdb-boot', async () => {
      const pm = await import('@speckle/packfile-manager')
      const tab = pm.getTabClient()
      const q = await withTimeout(tab.query('SELECT 42 AS answer'), 'duckdb-boot', 60000)
      const row = q.get(0)
      return `worker+wasm up, SELECT 42 -> ${String(row?.answer)}`
    })

    this.log('capability probes finished')
  }

  private async probe(name: string, fn: () => Promise<string>, timeoutMs?: number) {
    const row = this.addRow(name, 'pending', 'running…')
    try {
      const detail = timeoutMs ? await withTimeout(fn(), name, timeoutMs) : await fn()
      if (detail.startsWith('FAIL')) this.setRow(row, 'fail', detail)
      else this.setRow(row, 'ok', detail)
    } catch (e) {
      this.setRow(row, 'fail', errMsg(e))
    }
    this.log(`${name} -> ${row.detailEl.textContent}`)
  }

  /* ---------------------------------------------------------- data probes */

  /** Walks the matrix for the first value cell whose source has the modelInfo role. */
  private findModelInfoValue(dv: powerbi.DataView): string | null {
    const matrix = dv.matrix
    if (!matrix) return null
    const modelInfoIndices = new Set<number>()
    ;(matrix.valueSources || []).forEach((src, i) => {
      if (src.roles && src.roles.modelInfo) modelInfoIndices.add(i)
    })

    let found: string | null = null
    const walk = (node: DataViewMatrixNode) => {
      if (found) return
      if (node.values) {
        for (const key of Object.keys(node.values)) {
          const idx = Number(key)
          const cell = node.values[idx]
          const valueSourceIdx = cell.valueSourceIndex ?? idx
          if (
            (modelInfoIndices.size === 0 || modelInfoIndices.has(valueSourceIdx)) &&
            typeof cell.value === 'string' &&
            cell.value.length > 50
          ) {
            found = cell.value
            return
          }
        }
      }
      for (const child of node.children || []) walk(child)
    }
    if (matrix.rows?.root) walk(matrix.rows.root)
    return found
  }

  private async runDataProbes(modelInfoRaw: string) {
    let info: DecodedModelInfoLite | null = null

    await this.probe('model-info-decode', async () => {
      const first = modelInfoRaw.split('|||')[0]
      info = JSON.parse(atob(first.trim())) as DecodedModelInfoLite
      return (
        `pipeline=${info.pipeline} schema=${info.schemaVersion} server=${info.server} ` +
        `project=${info.projectId} model=${info.modelId} version=${info.versionId} ` +
        `token=${info.token ? 'yes' : 'NO'}`
      )
    })
    if (!info) return
    const { server, projectId, modelId, versionId, token } = info as DecodedModelInfoLite
    if (!server || !projectId) return

    let files: { name: string; url: string }[] = []
    await this.probe('artifacts-list', async () => {
      const url = `${server}/api/v2/projects/${projectId}/models/${modelId}/versions/${versionId}/artifacts`
      const resp = await withTimeout(
        fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined }),
        'artifacts'
      )
      if (!resp.ok) return `FAIL HTTP ${resp.status}`
      const body = (await resp.json()) as { files?: { name: string; url: string }[] }
      files = body.files || []
      return `${files.length} files: ${files
        .slice(0, 6)
        .map((f) => f.name)
        .join(', ')}${files.length > 6 ? ', …' : ''}`
    })

    if (files.length > 0) {
      await this.probe('presigned-range-read', async () => {
        // NO auth header here — presigned URLs reject bearer tokens on S3
        const resp = await withTimeout(
          fetch(files[0].url, { headers: { Range: 'bytes=0-63' } }),
          'range'
        )
        if (!resp.ok && resp.status !== 206) return `FAIL HTTP ${resp.status}`
        const buf = await resp.arrayBuffer()
        const head = Array.from(new Uint8Array(buf.slice(0, 4)))
          .map((b) => String.fromCharCode(b))
          .join('')
        return `HTTP ${resp.status}, ${buf.byteLength} bytes, magic="${head}"`
      })

      // ── stage 2: the loader's whole data layer, in-memory (no OPFS) ────────
      // download the bundle, register every parquet as a duckdb file buffer,
      // attach the eav/envelope views, count objects, and read a page of raw
      // SGEO geometry blobs — SpecklePackfileLoader2 minus the WorldTree.
      await this.probe('duckdb-bundle', async () => {
        const pm = await import('@speckle/packfile-manager')
        const tab = pm.getTabClient()
        const t0 = performance.now()

        let bytes = 0
        for (const f of files) {
          const resp = await withTimeout(fetch(f.url), `download ${f.name}`, 120000)
          if (!resp.ok) return `FAIL download ${f.name}: HTTP ${resp.status}`
          const buf = new Uint8Array(await resp.arrayBuffer())
          bytes += buf.byteLength
          await tab.registerFileBuffer(f.name, buf)
        }

        const geometryFiles = files.filter((f) =>
          /\.geometries(?:\.\d+)?\.parquet$/.test(f.name)
        )
        const views = files
          .map((f) => ({
            name: f.name,
            view: f.name.match(/\.(?:eav|envelope)\.(.+)\.parquet$/)?.[1] ?? null
          }))
          .filter((v): v is { name: string; view: string } => v.view !== null)

        const schema = `probe_${versionId}`
        await tab.attachParquetBundleFromBuffers(
          schema,
          views.map((v) => ({ view: v.view, name: v.name }))
        )

        const q = await tab.query(`SELECT count(*) AS n FROM "${schema}"."objects"`)
        const objectCount = Number(q.get(0)?.n ?? -1)

        let geomInfo = 'no geometry shard'
        if (geometryFiles.length > 0) {
          const blobs = await tab.readGeometryBlobs(
            geometryFiles.map((g) => g.name),
            0,
            50,
            true
          )
          const first = blobs[0]
          const magic = first
            ? Array.from(first.content.slice(0, 4))
                .map((b) => String.fromCharCode(b))
                .join('')
            : 'n/a'
          geomInfo = `${blobs.length} geometry blobs read (first: type=${first?.type}, magic="${magic}")`
        }

        const secs = ((performance.now() - t0) / 1000).toFixed(1)
        return (
          `${files.length} parquets (${(bytes / 1024 / 1024).toFixed(1)}MB) in-memory, ` +
          `${views.length} views attached, objects=${objectCount}, ${geomInfo} — ${secs}s`
        )
      }, 180000)

      // ── stage 3: the REAL loader + viewer, rendering into the panel ────────
      await this.probe('viewer-render', async () => {
        const viewerMod = await import('@speckle/viewer')
        const holder = document.createElement('div')
        holder.style.cssText =
          'position:relative;width:100%;height:340px;margin-top:8px;border:1px solid #30363d'
        this.panel.appendChild(holder)

        const params = viewerMod.DefaultViewerParams
        params.showStats = false
        params.verbose = false
        const viewer = new viewerMod.Viewer(holder, params)
        await viewer.init()
        viewer.createExtension(viewerMod.CameraController)

        const artifactsUrl = `${server}/api/v2/projects/${projectId}/models/${modelId}/versions/${versionId}/artifacts`
        const t0 = performance.now()
        // 5th arg forces the in-memory (no-OPFS) path
        const loader = new viewerMod.SpecklePackfileLoader2(
          viewer.getWorldTree(),
          artifactsUrl,
          token,
          undefined,
          true
        )
        await viewer.loadObject(loader, true)
        const secs = ((performance.now() - t0) / 1000).toFixed(1)
        return `RENDERED — worldTree nodes=${viewer.getWorldTree().nodeCount} in ${secs}s`
      }, 300000)
    }

    this.log('data probes finished')
  }
}

/* ------------------------------------------------------------------------
 * Module-scope self-registration + registry diagnostics.
 *
 * The generated visualPlugin.ts registers ONLY on `window.powerbi` and skips
 * SILENTLY when it's undefined — inside the Service's isolate wrapper the
 * `window` binding may be a clone that lacks `powerbi`, the host lookup then
 * gets undefined and dies with the masked sendError "reading 'name'" crash.
 * Here we inspect every reachable global, log where `powerbi` actually lives
 * and which plugin names its registry already holds, and register ourselves
 * on all of them.
 * ---------------------------------------------------------------------- */
try {
  const PLUGIN_NAMES = ['specklePowerBiVisual_DEBUG', 'specklePowerBiVisual']
  const plugin = {
    name: PLUGIN_NAMES[0],
    displayName: 'Speckle probe',
    class: 'Visual',
    apiVersion: '5.4.0',
    custom: true,
    create: (options: VisualConstructorOptions) => new Visual(options)
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const candidates: Array<[string, any]> = [
    ['window', typeof window !== 'undefined' ? window : undefined],
    ['self', typeof self !== 'undefined' ? self : undefined],
    ['globalThis', typeof globalThis !== 'undefined' ? globalThis : undefined],
    ['realGlobal', realGlobal]
  ]
  const seen: unknown[] = []
  for (const [label, g] of candidates) {
    try {
      if (!g) {
        console.log(LOG_PREFIX, `global ${label}: undefined`)
        continue
      }
      const dup = seen.indexOf(g) >= 0
      seen.push(g)
      const pb = g.powerbi
      if (!pb) {
        console.log(LOG_PREFIX, `global ${label}${dup ? ' (dup)' : ''}: no powerbi object`)
        continue
      }
      pb.visuals = pb.visuals || {}
      pb.visuals.plugins = pb.visuals.plugins || {}
      const existing = Object.keys(pb.visuals.plugins)
      for (const name of PLUGIN_NAMES) pb.visuals.plugins[name] = plugin
      if (!dup) {
        // registration alone wasn't enough (Service still died in
        // executeMessage before create) — wrap the registry in a logging
        // Proxy so the console shows the EXACT name the host looks up, and
        // hand any string lookup our plugin so create() proceeds regardless
        const target = pb.visuals.plugins
        pb.visuals.plugins = new Proxy(target, {
          get(t, prop, receiver) {
            const v = Reflect.get(t, prop, receiver)
            if (typeof prop === 'string' && !(prop in Object.prototype)) {
              console.log(
                LOG_PREFIX,
                `plugins registry GET "${prop}" -> ${v ? 'hit' : 'MISS (returning probe plugin)'}`
              )
              return v ?? plugin
            }
            return v
          },
          has(t, prop) {
            const present = Reflect.has(t, prop)
            if (typeof prop === 'string')
              console.log(LOG_PREFIX, `plugins registry HAS "${prop}" -> ${present}`)
            return present
          }
        })
        console.log(
          LOG_PREFIX,
          `powerbi keys=[${Object.keys(pb).join(', ')}] version=${String(pb.version)}`
        )
      }
      console.log(
        LOG_PREFIX,
        `global ${label}${dup ? ' (dup)' : ''}: powerbi FOUND, ` +
          `plugins before=[${existing.join(', ') || 'none'}], registered [${PLUGIN_NAMES.join(', ')}]`
      )
    } catch (e) {
      console.log(LOG_PREFIX, `global ${label}: access threw`, e)
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // round 3 showed the host never consults powerbi.visuals.plugins — the
  // modern convention reads the webpack library global `window[guid].default`
  // instead, and our output.library is the guid WITHOUT the _DEBUG suffix the
  // served pbiviz.json advertises. Expose the module under every name.
  const libraryExport = { default: plugin, Visual }
  for (const [, g] of candidates) {
    if (!g) continue
    for (const name of PLUGIN_NAMES) {
      try {
        if (g[name] === undefined) g[name] = libraryExport
      } catch {
        /* read-only global */
      }
    }
  }
  console.log(LOG_PREFIX, `library globals exposed as [${PLUGIN_NAMES.join(', ')}] {default: plugin}`)
} catch (e) {
  console.log(LOG_PREFIX, 'self-registration failed', e)
}

// (an own-source dump of the sandbox host lived here during rounds 3-4; it
// dies on CORS from the null origin and the mystery is solved — the host
// resolves the visual via the webpack library global window[<guid>].default,
// so output.library must carry the _DEBUG suffix in dev builds)

// module-scope uncaught-error tap: catches failures between module eval and
// the constructor (where the in-panel traps take over)
try {
  realGlobal.addEventListener('error', (e: ErrorEvent) => {
    console.log(LOG_PREFIX, 'uncaught error:', e.message, '@', e.filename, e.lineno, e.error)
  })
  realGlobal.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    console.log(LOG_PREFIX, 'unhandled rejection:', e.reason)
  })
} catch {
  /* ignore */
}

console.log(LOG_PREFIX, 'module evaluation completed')
