import { useVisualStore } from '@src/store/visualStore'
import { ObjectLoader2Factory } from '@speckle/objectloader2'

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
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }

  async downloadObjectsWithChildren(
    objectId: string,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<SpeckleObject[]> {
    const visualStore = useVisualStore()

    visualStore.setLoadingProgress('Initializing object loader', 0)
    console.log('Creating ObjectLoader v1 for Power BI environment')

    const loader = ObjectLoader2Factory.createFromUrl({
      serverUrl: this.serverUrl,
      streamId: this.projectId,
      objectId,
      token: this.token,
      attributeMask: { exclude: ['properties', 'encodedValue'] }
    })

    try {
      // Get total count for progress tracking
      const totalCount = await loader.getTotalObjectCount()
      console.log(`Loading ${totalCount} objects using ObjectLoader v1`)

      const objects: SpeckleObject[] = []
      let loadedCount = 0
      let first = true

      const rootObject = await loader.getRootObject()
      objects.push(rootObject.base as SpeckleObject)

      // Stream all objects using the async iterator
      for await (const obj of loader.getObjectIterator()) {
        if (first) {
          first = false
          loadedCount++
          continue
        }
        objects.push(obj as SpeckleObject) // Type assertion since ObjectLoader v1 has different type
        loadedCount++

        // Update progress
        if (onProgress) {
          onProgress(loadedCount, totalCount)
        }

        const progress = totalCount > 0 ? loadedCount / totalCount : 0
        visualStore.setLoadingProgress('🌍 Loading from Speckle', progress)

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
}
