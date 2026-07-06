/**
 * Power BI runs the visual in a sandboxed iframe (opaque origin) whose CSP
 * allows workers only from `blob:` (and same-origin) — never from a
 * cross-origin script URL, and never from the raw file:/// module path. The
 * viewer stack (@speckle/packfile-manager) creates duckdb-wasm workers from
 * URLs, which the sandbox blocks.
 *
 * This shim replaces the global Worker constructor so any worker created from
 * an http(s)/file script URL is instead fetched as text, wrapped in a Blob,
 * and constructed from the resulting blob: URL. The fetched source is prefixed
 * with this same shim (kept in a global) so workers spawned INSIDE a worker
 * (duckdb's nested browser worker) are blob-ified too. webpack bakes absolute
 * URLs (publicPath is absolute) into the worker code, so `?url` assets such as
 * the wasm still resolve from within a blob worker.
 *
 * Import this module FIRST, before any viewer code.
 */

// The shim body as a string so it can be re-installed inside spawned workers.
// It reads its own source from globalThis.__speckleWorkerShimSrc and prepends
// it to every fetched worker script.
const SHIM_BODY = `
(function () {
  var g = typeof self !== 'undefined' ? self : globalThis;
  if (!g.Worker || g.Worker.__speckleBlobShim) return;
  var NativeWorker = g.Worker;
  function toBlobUrl(scriptUrl) {
    var base = (g.location && g.location.href) || undefined;
    var abs = new URL(scriptUrl, base).href;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', abs, false);
    xhr.send();
    if (xhr.status && (xhr.status < 200 || xhr.status >= 300)) {
      throw new Error('Speckle worker shim: failed to fetch ' + abs + ' (' + xhr.status + ')');
    }
    var shimSrc = g.__speckleWorkerShimSrc || '';
    var wrapped = shimSrc + '\\n//# sourceURL=' + abs + '\\n' + xhr.responseText;
    return URL.createObjectURL(new Blob([wrapped], { type: 'application/javascript' }));
  }
  function ShimWorker(scriptUrl, options) {
    try {
      var href = scriptUrl instanceof URL ? scriptUrl.href : scriptUrl;
      if (typeof href === 'string' && !/^(blob:|data:)/.test(href)) {
        return new NativeWorker(toBlobUrl(href), options);
      }
    } catch (e) {
      (g.console && g.console.error) && g.console.error('Speckle worker shim failed, using native', e);
    }
    return new NativeWorker(scriptUrl, options);
  }
  ShimWorker.__speckleBlobShim = true;
  g.Worker = ShimWorker;
})();
`

try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = typeof self !== 'undefined' ? self : globalThis
  // expose the source so spawned workers can reinstall the shim on themselves
  g.__speckleWorkerShimSrc =
    'globalThis.__speckleWorkerShimSrc = ' + JSON.stringify(SHIM_BODY) + ';\n' + SHIM_BODY
  // install on the main thread now
  // eslint-disable-next-line @typescript-eslint/no-new-func
  new Function(SHIM_BODY)()
} catch (e) {
  // eslint-disable-next-line no-console
  console.error('Speckle worker shim install failed', e)
}

export {}
