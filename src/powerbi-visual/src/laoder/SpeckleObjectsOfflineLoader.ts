import { ObjectLoader2Factory } from '@speckle/objectloader2'
import { SpeckleLoader, WorldTree } from '@speckle/viewer'

// Base type from objectloader2 (has id, speckle_type properties)
interface Base {
  id: string
  speckle_type: string
  [key: string]: any
}

export class SpeckleObjectsOfflineLoader extends SpeckleLoader {
  constructor(targetTree: WorldTree, resourceData: unknown, resourceId?: string) {
    // Resource ID is not used for offline loading since we have objects in memory
    // Pass empty string to avoid URL parsing issues
    super(targetTree, '', undefined, undefined, resourceData)
  }

  protected initObjectLoader(
    resource: string,
    authToken?: string,
    enableCaching?: boolean,
    resourceData?: unknown
  ): ReturnType<SpeckleLoader['initObjectLoader']> {
    // Use ObjectLoader2Factory.createFromObjects for offline/memory-based loading
    // The objects array must contain ALL objects (root + all children)
    // The first object in the array must be the root object
    const objects = (resourceData ?? this._resourceData) as Base[]

    if (!objects || objects.length === 0) {
      throw new Error('SpeckleObjectsOfflineLoader: No objects provided')
    }

    // Ensure all objects have an 'id' property
    const missingIds = objects.filter((obj) => !obj.id)
    if (missingIds.length > 0) {
      console.error('Objects missing id property:', missingIds.slice(0, 5))
      throw new Error(
        `SpeckleObjectsOfflineLoader: ${missingIds.length} objects are missing 'id' property`
      )
    }

    console.log(`Creating offline loader with ${objects.length} objects, root: ${objects[0].id}`)

    // Create a Set of all object IDs for quick lookup
    const objectIds = new Set(objects.map((obj) => obj.id))

    // Check for references to objects that aren't in the array
    const missingReferences = new Set<string>()
    objects.forEach((obj) => {
      // Check all properties for references (objects that look like { referencedId: "xxx" })
      Object.values(obj).forEach((value) => {
        if (value && typeof value === 'object') {
          if ('referencedId' in value && typeof value.referencedId === 'string') {
            if (!objectIds.has(value.referencedId)) {
              missingReferences.add(value.referencedId)
            }
          }
        }
        // Check arrays for references
        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (item && typeof item === 'object' && 'referencedId' in item) {
              if (!objectIds.has(item.referencedId)) {
                missingReferences.add(item.referencedId)
              }
            }
          })
        }
      })
    })

    if (missingReferences.size > 0) {
      console.warn(
        `⚠️ Found ${missingReferences.size} missing object references:`,
        Array.from(missingReferences).slice(0, 10)
      )
    } else {
      console.log('✅ All object references are present')
    }

    // @ts-ignore - Type compatibility issue between local objectloader2 and viewer's objectloader2
    return ObjectLoader2Factory.createFromObjects(objects)
  }

  public async load(): Promise<boolean> {
    const rootObject = await this.loader.getRootObject()
    if (!rootObject) {
      console.error('No root object found!')
      return false
    }

    /** Set resource to a fake URL for logging purposes only */
    this._resource = this._resource || `/json/${rootObject.baseId as string}`

    console.log('Loading objects from memory (offline mode)')

    // Call parent load() which will use our ObjectLoader2 to iterate through objects
    // Since we're using MemoryDownloader, it won't actually download anything
    return super.load()
  }
}
