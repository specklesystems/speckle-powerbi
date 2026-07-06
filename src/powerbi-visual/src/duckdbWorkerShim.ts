/**
 * Power BI runs the visual in a sandboxed iframe whose CSP allows workers only
 * from `blob:`/`data:`/same-origin — never from a cross-origin script URL or
 * the raw file:/// module path. @speckle/packfile-manager creates its duckdb
 * worker from `new Worker(new URL('./duckdbWorker.js', import.meta.url))`,
 * which webpack rewrites to a (possibly cross-origin) chunk URL.
 *
 * This shim replaces the global Worker so any http(s)/file script-URL worker is
 * fetched as text and constructed from a `blob:` URL instead. The blob worker
 * keeps webpack's absolute base, so its own assets resolve. The duckdb worker
 * this creates spawns ONE nested worker (duckdb's browser worker); that one is
 * inlined as a `data:` URL at build time (webpack rule) so it needs no shim.
 *
 * Import this module FIRST, before any viewer code.
 */

/* eslint-disable no-console */

function installShim(): void {
  // MUST patch the REAL global, not `self`/`window`: the Power BI isolate
  // wrapper runs the visual with `var self = this` bound to a cloned window,
  // so `self.Worker = ...` only patches the clone — but webpack's compiled
  // `new Worker(...)` uses the bare `Worker` identifier, which resolves to the
  // real global. Function('return this') escapes the wrapper to the real one.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-implied-eval
  const g: any = Function('return this')()
  const NativeWorker = g.Worker
  if (!NativeWorker || NativeWorker.__speckleBlobShim) return

  const toBlobUrl = (scriptUrl: string): string => {
    const base = (g.location && g.location.href) || undefined
    const abs = new URL(scriptUrl, base).href
    const xhr = new XMLHttpRequest()
    xhr.open('GET', abs, false) // sync: Worker construction is synchronous
    xhr.send()
    if (xhr.status && (xhr.status < 200 || xhr.status >= 300)) {
      throw new Error(`Speckle worker shim: failed to fetch ${abs} (${xhr.status})`)
    }
    const wrapped = `//# sourceURL=${abs}\n${xhr.responseText}`
    return URL.createObjectURL(new Blob([wrapped], { type: 'application/javascript' }))
  }

  const ShimWorker = function (this: unknown, scriptUrl: unknown, options?: unknown) {
    try {
      const href = scriptUrl instanceof URL ? scriptUrl.href : scriptUrl
      if (typeof href === 'string' && !/^(blob:|data:)/.test(href)) {
        // The PBI sandbox blocks {type:'module'} blob workers but allows
        // classic ones (probe-verified). Webpack's worker chunks are
        // classic-compatible (importScripts-style, no top-level import), so
        // stripping the module type is safe.
        let opts = options as WorkerOptions | undefined
        if (opts && opts.type === 'module') {
          opts = { ...opts, type: 'classic' }
        }
        return new NativeWorker(toBlobUrl(href), opts)
      }
    } catch (e) {
      console.error('Speckle worker shim failed, using native Worker', e)
    }
    return new NativeWorker(scriptUrl as string | URL, options as WorkerOptions)
  } as unknown as typeof Worker

  ;(ShimWorker as unknown as { __speckleBlobShim: boolean }).__speckleBlobShim = true
  g.Worker = ShimWorker
}

try {
  installShim()
} catch (e) {
  console.error('Speckle worker shim install failed', e)
}

export {}
