/**
 * Decoded "Model Info" blob passed from the data connector (schemaVersion 2).
 * The connector base64-encodes one JSON record per model into the "Model Info"
 * column; federated loads join multiple blobs with the '|||' delimiter.
 *
 * pipeline tells the visual how the model data was produced:
 *  - "artifact": 4.0 parquet artifact bundle — load via SpecklePackfileLoader2,
 *    objects are keyed by applicationId
 *  - "legacy": pre-4.0 version served through the old JSON path — the 3D view
 *    is unavailable; the visual explains this instead of loading
 */
export interface DecodedModelInfo {
  schemaVersion: number
  pipeline: 'artifact' | 'legacy'
  server: string
  projectId: string
  modelId: string
  versionId: string
  token: string // weak token with limited scopes
  email?: string
  workspaceId?: string | null
  workspaceName?: string | null
  workspaceLogo?: string | null
  canHideBranding?: boolean
  sourceApplication?: string
  version?: string
  /** only present when pipeline === "legacy" */
  rootObjectId?: string
}

const REQUIRED_FIELDS: (keyof DecodedModelInfo)[] = [
  'schemaVersion',
  'pipeline',
  'server',
  'projectId',
  'modelId',
  'versionId',
  'token'
]

const OUTDATED_CONNECTOR_MESSAGE =
  'This data was loaded with an older Speckle connector. Refresh the query with Speckle connector 4.x to use this visual.'

// Decodes one base64-encoded model-info blob
export function decodeModelInfo(encodedString: string): DecodedModelInfo {
  let info: DecodedModelInfo
  try {
    info = JSON.parse(atob(encodedString.trim())) as DecodedModelInfo
  } catch (error) {
    throw new Error(
      `Failed to decode model info: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }

  // v1 blobs (no schemaVersion) come from pre-4.0 connectors
  if (!info.schemaVersion || info.schemaVersion < 2) {
    throw new Error(OUTDATED_CONNECTOR_MESSAGE)
  }

  const missingFields = REQUIRED_FIELDS.filter((field) => !info[field])
  if (missingFields.length > 0) {
    throw new Error(
      `Missing required fields in decoded model info: ${missingFields.join(', ')}`
    )
  }

  return info
}

// Decodes the "Model Info" cell value, handling both single and federated
// ('|||'-joined) encodings. Returns one record per model.
export function decodeModelInfos(encodedString: string): DecodedModelInfo[] {
  return encodedString.split('|||').map((segment, index) => {
    try {
      return decodeModelInfo(segment)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      if (message === OUTDATED_CONNECTOR_MESSAGE) throw error
      throw new Error(
        `Failed to decode segment ${index + 1} of federated model data: ${message}`
      )
    }
  })
}
