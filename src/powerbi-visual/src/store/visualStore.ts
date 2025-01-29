import { IViewerEvents } from '@src/plugins/viewer'
import { SpeckleDataInput } from '@src/types'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

export type InputState = 'valid' | 'incomplete' | 'invalid'

export type FieldInputState = {
  rootObjectId: boolean
  objectIds: boolean
  colorBy: boolean
  tooltipData: boolean
}

export const useVisualStore = defineStore('visualStore', () => {
  const host = shallowRef<powerbi.extensibility.visual.IVisualHost>()
  const objectsFromStore = ref<object[]>(undefined)
  const isViewerInitialized = ref<boolean>(false)
  const isViewerReadyToLoad = ref<boolean>(false)
  const isViewerObjectsLoaded = ref<boolean>(false)
  const viewerReloadNeeded = ref<boolean>(false)
  const fieldInputState = ref<FieldInputState>({
    rootObjectId: false,
    objectIds: false,
    colorBy: false,
    tooltipData: false
  })
  const lastLoadedRootObjectId = ref<string>()

  // callback mechanism to viewer to be able to manage input data accordingly.
  // Note: storing whole viewer in store is not make sense and also pinia ts complains about it for serialization issues.
  // Error was and you can not/should not compress: 👇
  // `The inferred type of this node exceeds the maximum length the compiler will serialize. An explicit type annotation is needed.ts(7056)`
  const viewerEmit =
    ref<
      <E extends keyof IViewerEvents>(event: E, ...payload: Parameters<IViewerEvents[E]>) => void
    >()

  // TODO: investigate about shallow ref? https://vuejs.org/api/reactivity-advanced.html#shallowref
  const dataInput = shallowRef<SpeckleDataInput | null>()
  const dataInputStatus = ref<InputState>('incomplete')

  /**
   * Ideally one time setup on initialization.
   * @param hostToSet interaction layer with powerbi host. it is useful when you wanna trigger `launchUrl` kind functions. TODO: need more understanding.
   */
  const setHost = (hostToSet: powerbi.extensibility.visual.IVisualHost) => {
    host.value = hostToSet
  }

  /**
   * Ideally one time set when onMounted of `ViewerWrapper.vue` component
   * @param emit picky emit function to trigger events under `IViewerEvents` interface
   */
  const setViewerEmitter = (
    emit: <E extends keyof IViewerEvents>(
      event: E,
      ...payload: Parameters<IViewerEvents[E]>
    ) => void
  ) => {
    if (emit) {
      viewerEmit.value = emit
      viewerEmit.value('ping', '✅ Emitter successfully attached to the store.')
      isViewerInitialized.value = true // this is needed to be delay first load at the visual.ts file
    }
  }

  const setObjectsFromStore = (newObjectsFromStore: object[]) => {
    objectsFromStore.value = newObjectsFromStore
  }

  // MAKE TS HAPPY
  type SpeckleObject = {
    id: string
  }

  const loadObjectsFromFile = async (objects: object[]) => {
    lastLoadedRootObjectId.value = (objects[0] as SpeckleObject).id
    viewerReloadNeeded.value = false
    console.log(`📦 Loading viewer from cached data with ${lastLoadedRootObjectId.value} id.`)
    await viewerEmit.value('loadObjects', objects)
    objectsFromStore.value = objects
    isViewerObjectsLoaded.value = true
  }

  /**
   * Sets upcoming data input into store to be able to pass it through viewer by evaluating the data.
   * @param newValue new data input that user dragged and dropped to the fields in visual
   */
  const setDataInput = async (newValue: SpeckleDataInput) => {
    dataInput.value = newValue

    if (viewerReloadNeeded.value) {
      lastLoadedRootObjectId.value = (dataInput.value.objects[0] as SpeckleObject).id
      console.log(`🔄 Forcing viewer re-render for new root object id.`)
      await viewerEmit.value('loadObjects', dataInput.value.objects)
      viewerReloadNeeded.value = false
      writeObjectsToFile(dataInput.value.objects)
    }

    if (dataInput.value.selectedIds.length > 0) {
      viewerEmit.value('isolateObjects', dataInput.value.selectedIds)
    } else {
      viewerEmit.value('isolateObjects', dataInput.value.objectIds)
    }
    viewerEmit.value('colorObjectsByGroup', dataInput.value.colorByIds)
  }

  const writeObjectsToFile = (objects: object[]) => {
    host.value.persistProperties({
      merge: [
        {
          objectName: 'storedData',
          properties: {
            fullData: JSON.stringify(objects)
          },
          selector: null
        }
      ]
    })
  }

  const setFieldInputState = (newFieldInputState: FieldInputState) =>
    (fieldInputState.value = newFieldInputState)

  const clearDataInput = () => (dataInput.value = null)

  const setViewerReadyToLoad = () => (isViewerReadyToLoad.value = true)

  const setViewerReloadNeeded = () => (viewerReloadNeeded.value = true)

  return {
    host,
    objectsFromStore,
    isViewerInitialized,
    isViewerReadyToLoad,
    isViewerObjectsLoaded,
    viewerReloadNeeded,
    dataInput,
    dataInputStatus,
    viewerEmit,
    fieldInputState,
    lastLoadedRootObjectId,
    loadObjectsFromFile,
    setHost,
    setViewerReloadNeeded,
    setObjectsFromStore,
    writeObjectsToFile,
    setViewerEmitter,
    setDataInput,
    setFieldInputState,
    clearDataInput,
    setViewerReadyToLoad
  }
})
