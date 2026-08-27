// The applicationId ↔ dense-object-index dictionary of one version's bundle.
//
// The renderer and the interactions layer speak (modelId, dense objectIndex); Power BI rows
// speak applicationId (the connector's Application ID column). In frontend-3 this mapping
// lives behind the duckdb data plane (`SELECT object_index, application_id FROM objects` —
// ts-sdk bundleQueries.ts), but duckdb-wasm needs OPFS for its default factory and drags
// ~35 MB of wasm through the sandbox. The dictionary is one small parquet artifact
// (`{versionId}.eav.objects.parquet`), so read it directly with hyparquet (pure JS).
import { parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import type { ArtifactFile } from './artifacts.js'

export interface ObjectsDictionary {
  /** applicationId → dense object index. */
  toIndex: Map<string, number>
  /** dense object index → applicationId. */
  toApplicationId: Map<number, string>
}

const isObjectsParquet = (name: string): boolean => name.endsWith('.eav.objects.parquet')

/**
 * Fetch + parse the objects dictionary from the artifacts list. Presigned URL — no auth
 * header (same reason the parquet loads never carried one: S3 rejects double auth).
 */
export async function loadObjectsDictionary(
  files: ArtifactFile[]
): Promise<ObjectsDictionary> {
  const file = files.find((f) => isObjectsParquet(f.name))
  if (!file) throw new Error('artifacts list has no .eav.objects.parquet')
  const resp = await fetch(file.url)
  if (!resp.ok) {
    throw new Error(`objects dictionary fetch failed: ${resp.status} ${resp.statusText}`)
  }
  const buffer = await resp.arrayBuffer()
  const rows = (await parquetReadObjects({
    file: buffer,
    columns: ['object_index', 'application_id'],
    compressors
  })) as Array<{ object_index: number | bigint; application_id: string }>

  const toIndex = new Map<string, number>()
  const toApplicationId = new Map<number, string>()
  for (const row of rows) {
    const index = Number(row.object_index)
    const appId = String(row.application_id)
    toIndex.set(appId, index)
    toApplicationId.set(index, appId)
  }
  return { toIndex, toApplicationId }
}
