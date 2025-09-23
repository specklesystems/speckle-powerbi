import { SpeckleLoader, WorldTree } from '@speckle/viewer'
import { ObjectLoader2Factory } from '@speckle/objectloader2'

interface SpeckleObject {
  id: string
  speckle_type: string
  [key: string]: any
}

export class SpeckleObjectsOfflineLoader extends SpeckleLoader {
  constructor(targetTree: WorldTree, resourceData: unknown, resourceId?: string) {
    // Generate a resource ID from the first object if not provided
    let finalResourceId = resourceId
    if (!finalResourceId && Array.isArray(resourceData) && resourceData.length > 0) {
      const firstObj = (resourceData as SpeckleObject[])[0]
      if (firstObj && firstObj.id) {
        finalResourceId = `/objects/${firstObj.id}`
      }
    }
    super(targetTree, finalResourceId || '/objects/offline', undefined, undefined, resourceData)
  }

  protected initObjectLoader(
    resource: string,
    authToken?: string,
    enableCaching?: boolean,
    resourceData?: unknown
  ): any {
    // Return any to bypass type checking issues between different ObjectLoader2 versions
    // For offline loading, create loader from objects directly
    if (resourceData || this._resourceData) {
      const data = (resourceData ?? this._resourceData) as SpeckleObject[]
      // Ensure we have valid data
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(
          'Invalid resource data for offline loading: expected non-empty array of objects'
        )
      }

      console.log(`SpeckleObjectsOfflineLoader: Creating loader with ${data.length} objects`)

      // Ensure all objects have required fields for ObjectLoader2
      const validatedData = data.map((obj) => ({
        ...obj,
        id: obj.id || 'unknown',
        speckle_type: obj.speckle_type || 'Base'
      }))

      // Create loader from objects using ObjectLoader2Factory
      return ObjectLoader2Factory.createFromObjects(validatedData)
    }

    // Fall back to parent implementation for URL-based loading
    return super.initObjectLoader(resource, authToken, enableCaching)
  }

  public async load(): Promise<boolean> {
    // Initialize the loader first
    if (!this.loader) {
      this.loader = this.initObjectLoader(this._resource, undefined, false, this._resourceData)
    }

    // Ensure we have a valid resource path before calling parent load
    if (!this._resource || this._resource === '') {
      const rootObject = await this.loader.getRootObject()
      if (rootObject) {
        const rootObj = rootObject as any
        this._resource = `/objects/${rootObj.id || 'offline'}`
      } else {
        this._resource = '/objects/offline'
      }
    }

    return super.load()
  }
}
