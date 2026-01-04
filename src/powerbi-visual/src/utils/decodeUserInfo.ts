/**
 * Interface for decoded user info data passed from the data connector
 * This data is base64-encoded in the "Version Object ID" field and decoded by the visual
 */
export interface DecodedUserInfo {
  rootObjectId: string
  server: string
  email: string
  projectId: string
  token: string // weak token with limited scopes
  workspaceId?: string | null
  workspaceName?: string | null
  workspaceLogo?: string | null
  version?: string
  sourceApplication?: string
  canHideBranding?: boolean
  versionId?: string
  url?: string
}


// Decodes a base64-encoded JSON string to extract userInfoData
export function decodeUserInfo(encodedString: string): DecodedUserInfo {
  try {
    // Base64 decode using browser's atob()
    const decodedString = atob(encodedString)

    // Parse JSON
    const userInfo = JSON.parse(decodedString) as DecodedUserInfo

    // Validate required fields
    const requiredFields: (keyof DecodedUserInfo)[] = [
      'rootObjectId',
      'server',
      'email',
      'projectId',
      'token'
    ]

    const missingFields = requiredFields.filter((field) => !userInfo[field])

    if (missingFields.length > 0) {
      throw new Error(
        `Missing required fields in decoded user info: ${missingFields.join(', ')}`
      )
    }

    return userInfo
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to decode user info: ${error.message}`)
    }
    throw new Error('Failed to decode user info: Unknown error')
  }
}

// Decodes multiple base64-encoded userInfo strings (for federated models)

export function decodeMultipleUserInfo(encodedStrings: string): DecodedUserInfo[] {
  try {
    // Split by delimiter
    const segments = encodedStrings.split('|||')

    // Decode each segment
    return segments.map((segment, index) => {
      try {
        return decodeUserInfo(segment.trim())
      } catch (error) {
        throw new Error(
          `Failed to decode segment ${index + 1} of federated model data: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        )
      }
    })
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to decode multiple user info: ${error.message}`)
    }
    throw new Error('Failed to decode multiple user info: Unknown error')
  }
}

// Checks if an encoded string contains multiple models (federated)
export function isFederatedEncoding(encodedString: string): boolean {
  return encodedString.includes('|||')
}

// Safely decodes userInfo, handling both single and federated models
// Returns an array of DecodedUserInfo (single item for non-federated)
export function decodeUserInfoSafe(encodedString: string): DecodedUserInfo[] {
  if (isFederatedEncoding(encodedString)) {
    return decodeMultipleUserInfo(encodedString)
  } else {
    return [decodeUserInfo(encodedString)]
  }
}
