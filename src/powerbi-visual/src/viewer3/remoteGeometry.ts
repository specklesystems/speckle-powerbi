// Adapted from @speckle/ts-sdk (packages/ts-sdk/src/viewer/remoteGeometry.ts,
// speckle-server-internal@speckle/next). Differences from the canonical hybrid flow:
//  - No OPFS anywhere: the Power BI sandbox has an opaque-origin iframe where
//    `navigator.storage` is unavailable, so the cache-first check, the background `.dat`
//    download and the `swapGeometrySource` swap are all dropped. The model streams over
//    the socket for its whole lifetime (the exact host ADR-0014 built this path for).
//  - No whole-file fallback: `loadUrl` needs OPFS too. A server that does not advertise
//    `geometryStream` is a hard error surfaced to the caller.
//  - Auth is the connector's plain weak token (no share-password flow in Power BI).
import type { Renderer } from '@speckle/viewer-webgpu'
import type { ArtifactsPayload } from './artifacts.js'
import type { OnLoadProgress } from './loadProgress.js'

/** The remote-geometry surface of `@speckle/viewer-webgpu`, feature-detected at runtime so
 *  a stale renderer build fails loudly instead of mysteriously. */
type RemoteCapableRenderer = Renderer & {
  loadRemoteBundleDat: (
    wsUrl: string,
    versionId: string,
    loadOpts: { residencyFraction?: number },
    opts?: {
      modelName?: string
      idx?: ArrayBuffer | string
      auth?: { token?: string; sharePasswordToken?: string }
      onPreparing?: (bytesDone: number, bytesTotal: number) => void
    }
  ) => Promise<void>
}

export const supportsRemoteGeometry = (
  renderer: Renderer
): renderer is RemoteCapableRenderer => {
  const candidate = renderer as Partial<RemoteCapableRenderer>
  return typeof candidate.loadRemoteBundleDat === 'function'
}

const toWsUrl = (serverUrl: string, path: string): string => {
  const origin = new URL(serverUrl)
  origin.protocol = origin.protocol === 'http:' ? 'ws:' : 'wss:'
  return new URL(path, origin).toString()
}

const isViewerIdx = (name: string): boolean => name.endsWith('.viewer.idx')
const isViewerDat = (name: string): boolean => name.endsWith('.viewer.dat')

/**
 * Load one version remote-first over the geometry-stream WebSocket. `payload` is the
 * already-fetched artifacts response (the caller needs it for the eav dictionary anyway).
 * Resolves once the scene is painting; throws when the version cannot stream.
 */
export const loadRemoteOnly = async (params: {
  renderer: Renderer
  serverUrl: string
  token?: string
  versionId: string
  modelName?: string
  payload: ArtifactsPayload
  residencyFraction: number
  onProgress?: OnLoadProgress
}): Promise<void> => {
  const {
    renderer,
    serverUrl,
    token,
    versionId,
    modelName,
    payload,
    residencyFraction,
    onProgress
  } = params

  if (!supportsRemoteGeometry(renderer)) {
    throw new Error(
      'this @speckle/viewer-webgpu build has no loadRemoteBundleDat — bump the package'
    )
  }
  if (!payload.geometryStream) {
    throw new Error(
      'server did not advertise a geometry stream for this version (no .viewer.dat artifact ' +
        'or the feature is disabled) — streaming is the only load path inside Power BI'
    )
  }
  if (!payload.files.find((f) => isViewerDat(f.name))) {
    throw new Error('artifacts list has no .viewer.dat')
  }

  // The idx artifact is an accelerator: hand the renderer its presigned URL so it fetches
  // it IN PARALLEL with the WS handshake (gzip-at-rest — the browser decompresses natively).
  // Without it the index is read over the socket, which serializes badly on whale models.
  const idxFile = payload.files.find((f) => isViewerIdx(f.name))
  onProgress?.({ phase: 'index', bytesLoaded: 0, bytesTotal: null })

  await renderer.loadRemoteBundleDat(
    toWsUrl(serverUrl, payload.geometryStream.path),
    versionId,
    { residencyFraction },
    {
      modelName,
      idx: idxFile?.url,
      auth: token ? { token } : undefined,
      // Cold-artifact acquisition on the server ("preparing 3D stream"): pre-paint, so it
      // feeds the blocking overlay. Total 0 = unknown → null (indeterminate bar).
      onPreparing: (bytesDone: number, bytesTotal: number) =>
        onProgress?.({
          phase: 'preparing',
          bytesLoaded: bytesDone,
          bytesTotal: bytesTotal > 0 ? bytesTotal : null
        })
    }
  )

  onProgress?.({ phase: 'painting', transport: 'remote' })
  // No background .dat acquisition in this host: backgroundDownloading is always false.
  onProgress?.({ phase: 'interactive', backgroundDownloading: false })
}
