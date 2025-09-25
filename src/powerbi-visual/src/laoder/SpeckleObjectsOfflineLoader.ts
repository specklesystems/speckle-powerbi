import { ObjectLoader2 } from '@speckle/objectloader2'
import { SpeckleLoader, WorldTree } from '@speckle/viewer'

export class SpeckleObjectsOfflineLoader extends SpeckleLoader {
  constructor(targetTree: WorldTree, resourceData: string, resourceId?: string) {
    super(targetTree, resourceId || '', undefined, undefined, resourceData)
  }

  protected initObjectLoader(
    resource: string,
    authToken?: string,
    enableCaching?: boolean,
    resourceData?: unknown
  ): ReturnType<SpeckleLoader['initObjectLoader']> {
    const data = (resourceData ?? this._resourceData) as unknown
    return super.initObjectLoader(resource, authToken, enableCaching, data)
  }

  public async load(): Promise<boolean> {
    const rootObject = await this.loader.getRootObject()
    if (!rootObject && this._resource) {
      console.error('No root id set!')
      return false
    }
    /** If not id is provided, we make one up based on the root object id */
    this._resource = this._resource || `/json/${rootObject.baseId as string}`
    return super.load()
  }
}
