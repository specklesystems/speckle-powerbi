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
import './probe.css'
import powerbi from 'powerbi-visuals-api'
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions
import IVisual = powerbi.extensibility.visual.IVisual
import DataViewMatrixNode = powerbi.DataViewMatrixNode

const PROBE_TIMEOUT_MS = 5000
const LOG_PREFIX = 'Speckle probe:'

// the isolate wrapper runs the visual with `self`/`window` bound to a CLONED
// window; event listeners and globals must reach the real one
const realGlobal = Function('return this')() as typeof globalThis & Window

type ProbeStatus = 'pending' | 'ok' | 'fail' | 'info'

interface ProbeRow {
  el: HTMLElement
  statusEl: HTMLElement
  detailEl: HTMLElement
}

const WASM_EMPTY_MODULE = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]

const errMsg = (e: unknown): string =>
  e instanceof Error ? `${e.name}: ${e.message}` : String(e)

const withTimeout = <T>(p: Promise<T>, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS)
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
        `isolateClone=${safe(() => (self as unknown) !== (realGlobal as unknown))}`
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

    this.log('capability probes finished')
  }

  private async probe(name: string, fn: () => Promise<string>) {
    const row = this.addRow(name, 'pending', 'running…')
    try {
      const detail = await fn()
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

    let firstFileUrl: string | null = null
    await this.probe('artifacts-list', async () => {
      const url = `${server}/api/v2/projects/${projectId}/models/${modelId}/versions/${versionId}/artifacts`
      const resp = await withTimeout(
        fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined }),
        'artifacts'
      )
      if (!resp.ok) return `FAIL HTTP ${resp.status}`
      const body = (await resp.json()) as { files?: { name: string; url: string }[] }
      const files = body.files || []
      firstFileUrl = files[0]?.url ?? null
      return `${files.length} files: ${files
        .slice(0, 6)
        .map((f) => f.name)
        .join(', ')}${files.length > 6 ? ', …' : ''}`
    })

    if (firstFileUrl) {
      await this.probe('presigned-range-read', async () => {
        // NO auth header here — presigned URLs reject bearer tokens on S3
        const resp = await withTimeout(
          fetch(firstFileUrl as string, { headers: { Range: 'bytes=0-63' } }),
          'range'
        )
        if (!resp.ok && resp.status !== 206) return `FAIL HTTP ${resp.status}`
        const buf = await resp.arrayBuffer()
        const head = Array.from(new Uint8Array(buf.slice(0, 4)))
          .map((b) => String.fromCharCode(b))
          .join('')
        return `HTTP ${resp.status}, ${buf.byteLength} bytes, magic="${head}"`
      })
    }

    this.log('data probes finished')
  }
}
