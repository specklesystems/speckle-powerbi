import {
  LegacyViewer,
  DefaultViewerParams,
  SpeckleOfflineLoader,
  FilteringState
} from '@speckle/viewer'
import { createNanoEvents, Emitter } from 'nanoevents'

export interface IViewer {
  /**
   * Events sent over from the host application.
   */
  on: <E extends keyof IViewerEvents>(event: E, callback: IViewerEvents[E]) => void
}

export interface IViewerEvents {
  ping: (message: string) => void,
  setSelection: (objectIds: string[]) => void,
  isolateObjects: (objectIds: string[]) => void,
  forceViewerUpdate: () => void,
  unIsolateObjects: () => void,
  loadObjects: (objects: object[]) => void,
}

export class ViewerHandler {
  public emitter: Emitter
  public viewer: LegacyViewer
  private filteringState: FilteringState

  constructor() {
    this.emitter = createNanoEvents()
    this.emit = this.emit.bind(this)
    this.emitter.on('ping', this.handlePing)
    this.emitter.on('setSelection', this.selectObjects)
    this.emitter.on('isolateObjects', this.isolateObjects)
    this.emitter.on('unIsolateObjects', this.unIsolateObjects)
    this.emitter.on('loadObjects', this.loadObjects)
  }

  async init(parent: HTMLElement) {
    this.viewer = await createViewer(parent)
  }

  emit<E extends keyof IViewerEvents>(
    event: E,
    ...payload: Parameters<IViewerEvents[E]>
  ): void {
    this.emitter.emit(event, ...payload)
  }

  public setView = (view: any) => {
    // TODO
    return
  }

  public setSectionBox = (bboxActive: boolean, objectIds: string[]) => {
    // TODO
    return
  }

  public selectObjects = async(objectIds: string[]) => {
    console.log('🔗 Handling setSelection inside ViewerHandler:', objectIds)
    await this.viewer.selectObjects(objectIds)
  }

  public isolateObjects = async(objectIds: string[], ghost: boolean) => {
    await this.unIsolateObjects()
    this.filteringState = await this.viewer.isolateObjects(objectIds, 'powerbi', true, ghost)
  }

  public unIsolateObjects = async() => {
    if (this.filteringState && this.filteringState.isolatedObjects){
      this.filteringState = await this.viewer.unIsolateObjects(this.filteringState.isolatedObjects, 'powerbi', true)
    }
  }

  public intersect = (args: {x: number, y: number}) => {
    // TODO
    return {hit: {}, objects: []}
  }

  public loadObjects = (objects: object[]) => {
    const stringifiedObject = JSON.stringify(objects)
    const loader = new SpeckleOfflineLoader(this.viewer.getWorldTree(), stringifiedObject)
    void this.viewer.loadObject(loader, true)
  }

  private handlePing = (message: string) => {
    console.log(message);
  }
}

const createViewer = async (parent: HTMLElement): Promise<LegacyViewer> => {
  const viewerSettings = DefaultViewerParams
  viewerSettings.showStats = false
  viewerSettings.verbose = false
  const viewer = new LegacyViewer(parent, viewerSettings)
  await viewer.init()
  console.log('🎥 Viewer is created!')
  return viewer
}