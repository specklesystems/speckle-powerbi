import { useVisualStore } from '@src/store/visualStore'

interface SpeckleObject {
  id: string
  speckleType?: string
  data?: any
  [key: string]: any
}


export class SpeckleApiLoader {
  private serverUrl: string
  private token: string
  private projectId: string
  private headers: Record<string, string>

  constructor(serverUrl: string, projectId: string, token: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '')
    this.projectId = projectId
    this.token = token
    this.headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }


  async downloadObjectsWithChildren(objectId: string, onProgress?: (loaded: number, total: number) => void): Promise<SpeckleObject[]> {
    const visualStore = useVisualStore()
    
    visualStore.setLoadingProgress('Downloading objects from Speckle', 0)

    // Use the correct REST API endpoint for downloading object and all its children
    const url = `${this.serverUrl}/objects/${this.projectId}/${objectId}`
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...this.headers,
        'Accept': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to download objects: ${response.statusText}`)
    }

    // Parse JSON response directly (not NDJSON)
    const objects: SpeckleObject[] = await response.json()
    
    console.log(`Downloaded ${objects.length} objects from Speckle REST API`)

    // Clean up objects (remove unnecessary data)
    for (let i = 1; i < objects.length; i++) {
      const obj = objects[i]
      if (obj.speckleType?.includes('Objects.Data.DataObject')) {
        delete obj.properties
      }
      delete obj.__closure
    }

    visualStore.setLoadingProgress('Download complete', 1)
    
    return objects
  }

  async downloadFromVersionId(versionId: string): Promise<SpeckleObject[]> {
    // For version IDs, we can't avoid GraphQL entirely as we need to resolve the referenced object
    // However, this method might not be used if we're getting object IDs directly from the data connector
    throw new Error('Version ID downloads not supported with weak tokens. Use object IDs directly.')
  }

  async downloadMultipleModels(objectIds: string[]): Promise<SpeckleObject[][]> {
    const allObjects: SpeckleObject[][] = []
    
    for (const objectId of objectIds) {
      const objects = await this.downloadObjectsWithChildren(objectId)
      allObjects.push(objects)
    }
    
    return allObjects
  }

  static async checkObjectExists(serverUrl: string, projectId: string, objectId: string, token: string): Promise<boolean> {
    const loader = new SpeckleApiLoader(serverUrl, projectId, token)
    
    try {
      // Try to download a minimal version of the object to check if it exists
      const objects = await loader.downloadObjectsWithChildren(objectId)
      return objects.length > 0
    } catch (error) {
      console.error('Error checking object existence:', error)
      return false
    }
  }
}