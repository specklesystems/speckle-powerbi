import { useVisualStore } from '@src/store/visualStore'
import ObjectLoader from '@speckle/objectloader' // Default import for v1

interface SpeckleObject {
  id: string
  speckle_type?: string
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

    visualStore.setLoadingProgress('Initializing object loader', 0)
    console.log('Creating ObjectLoader v1 for Power BI environment')

    // Create ObjectLoader v1 instance - use 'token' not 'authToken'
    const loader = new ObjectLoader({
      serverUrl: this.serverUrl,
      streamId: this.projectId,
      objectId: objectId,
      token: this.token,
      options: {
        enableCaching: false, // Disable caching for Power BI environment
      }
    })

    try {
      // Get total count for progress tracking
      const totalCount = await loader.getTotalObjectCount()
      console.log(`Loading ${totalCount} objects using ObjectLoader v1`)

      const objects: SpeckleObject[] = []
      let loadedCount = 0

      // Stream all objects using the async iterator
      for await (const obj of loader.getObjectIterator()) {
        objects.push(obj as SpeckleObject) // Type assertion since ObjectLoader v1 has different type
        loadedCount++

        // Update progress
        if (onProgress) {
          onProgress(loadedCount, totalCount)
        }

        const progress = totalCount > 0 ? loadedCount / totalCount : 0
        visualStore.setLoadingProgress('Loading objects from Speckle', progress)

        // Log progress every 100 objects
        if (loadedCount % 100 === 0) {
          console.log(`Loaded ${loadedCount}/${totalCount} objects`)
        }
      }

      console.log(`Downloaded ${objects.length} objects using ObjectLoader v1`)
      visualStore.setLoadingProgress('Download complete', 1)

      return objects

    } catch (error) {
      console.error('Error loading objects:', error)
      throw error
    } finally {
      // ObjectLoader v1 cleanup
      if (loader.dispose) {
        loader.dispose()
      }
    }
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