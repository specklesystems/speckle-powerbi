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
    console.log('Creating ObjectLoader v2 for Power BI environment')

    const loader = ObjectLoader2Factory.createFromUrl({
      serverUrl: this.serverUrl,
      streamId: this.projectId,
      objectId,
      token: this.token,
      attributeMask: { exclude: ['properties', 'encodedValue'] },
      options: { useCache: false }
    })

    try {
      // Get total count for progress tracking
      const totalCount = await loader.getTotalObjectCount()
      console.log(`Loading ${totalCount} objects using ObjectLoader v2`)

      const objects: SpeckleObject[] = []
      let loadedCount = 0

      // Stream all objects using the async iterator
      for await (const obj of loader.getObjectIterator()) {
        objects.push(obj as SpeckleObject) // Type assertion for SpeckleObject interface
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

      console.log(`Downloaded ${objects.length} objects using ObjectLoader v2`)

      visualStore.setLoadingProgress('🔄 Finalizing object download...', 0.9)

      // Recursively fetch all missing references until none remain
      let iterationCount = 0
      let totalFetched = 0

      while (iterationCount < 10) {
        // Safety limit: loop exits early when missingIds.size === 0 (line 108)
        // This limit only prevents infinite loops if something goes wrong
        iterationCount++

        const objectIds = new Set(objects.map((obj) => obj.id))
        const missingIds = new Set<string>()

        // Check all objects for missing references
        objects.forEach((obj) => {
          Object.values(obj).forEach((value) => {
            if (value && typeof value === 'object') {
              if ('referencedId' in value && typeof value.referencedId === 'string') {
                if (!objectIds.has(value.referencedId)) {
                  missingIds.add(value.referencedId)
                }
              }
            }
            if (Array.isArray(value)) {
              value.forEach((item) => {
                if (item && typeof item === 'object' && 'referencedId' in item) {
                  if (!objectIds.has(item.referencedId)) {
                    missingIds.add(item.referencedId)
                  }
                }
              })
            }
          })
        })

        if (missingIds.size === 0) {
          console.log(
            `✅ No more missing references. Complete after ${iterationCount} iteration(s)`
          )
          break
        }

        console.log(
          `Iteration ${iterationCount}: Fetching ${missingIds.size} missing referenced objects...`
        )

        visualStore.setLoadingProgress(`🔄 Loading additional objects)`, 0.9)

        // Fetch missing objects with progress tracking
        const missingIdsArray = Array.from(missingIds)
        let fetchedInIteration = 0

        for (const missingId of missingIdsArray) {
          try {
            const missingObj = await loader.getObject({ id: missingId })
            objects.push(missingObj as SpeckleObject)
            totalFetched++
            fetchedInIteration++

            // Update progress within this iteration
            const iterationProgress = fetchedInIteration / missingIdsArray.length
            visualStore.setLoadingProgress(
              `🔄 Loading objects (${objects.length} loaded)`,
              0.9 + iterationProgress * 0.05 // Progress from 0.9 to 0.95
            )
          } catch (err) {
            console.warn(`⚠️ Could not fetch missing object ${missingId}:`, err)
          }
        }

        console.log(
          `✅ Iteration ${iterationCount} complete. Fetched ${missingIdsArray.length} objects. Total: ${objects.length}`
        )
      }

      if (iterationCount >= 10) {
        console.warn(
          '⚠️ Reached maximum iterations for fetching references. Some objects may still be missing.'
        )
      }

      console.log(
        `✅ Downloaded total of ${objects.length} objects (${totalFetched} additional references fetched)`
      )

      visualStore.setLoadingProgress('Download complete', 1)

      return objects
    } catch (error) {
      console.error('Error loading objects:', error)
      throw error
    } finally {
      // Clean up the loader resources
      try {
        await loader.disposeAsync()
        console.log('ObjectLoader2 disposed successfully')
      } catch (disposeError) {
        console.warn('Error disposing ObjectLoader2:', disposeError)
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
}
