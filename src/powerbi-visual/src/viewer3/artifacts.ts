// Adapted from @speckle/ts-sdk (packages/ts-sdk/src/data/bundleAttach.ts,
// speckle-server-internal@speckle/next) — the artifacts-endpoint slice only; the duckdb
// attach machinery is deliberately left behind (no data plane in the Power BI sandbox).

/** One presigned file of a version's artefact bundle (~1h expiry). */
export interface ArtifactFile {
  name: string
  url: string
}

/**
 * Full artifacts response. `geometryStream` is the server's discovery-as-gate advertisement
 * of the geometry-stream WebSocket endpoint (present only when the server has the feature
 * enabled AND the version has a viewer `.dat`): a server-relative path — the client derives
 * ws(s) from the server origin. Its absence means the version cannot stream; the visual has
 * no whole-file fallback (that path needs OPFS, which the Power BI sandbox blocks).
 */
export interface ArtifactsPayload {
  files: ArtifactFile[]
  geometryStream?: { path: string }
}

export interface VersionRef {
  projectId: string
  modelId: string
  versionId: string
}

/** The per-version `/artifacts` endpoint. */
export function buildArtifactsUrl(serverOrigin: string, ref: VersionRef): string {
  return `${serverOrigin}/api/v2/projects/${ref.projectId}/models/${ref.modelId}/versions/${ref.versionId}/artifacts`
}

/** GET the artefact list for a version. Bearer auth (the connector's weak token). */
export async function fetchArtifactsPayload(
  artifactsUrl: string,
  token?: string
): Promise<ArtifactsPayload> {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const resp = await fetch(artifactsUrl, { headers })
  if (!resp.ok) {
    throw new Error(`artifacts fetch failed: ${resp.status} ${resp.statusText}`)
  }
  const body = (await resp.json()) as ArtifactsPayload
  if (!body.files?.length) throw new Error('artifacts response has no files')
  return body
}
