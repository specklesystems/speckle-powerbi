import { IViewerEvents } from '@src/plugins/viewer'
import { SpeckleDataInput } from '@src/types'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

export type InputState = 'valid' | 'incomplete' | 'invalid'

export type FieldInputState = {
  viewerData: boolean
  objectIds: boolean
  colorBy: boolean
  tooltipData: boolean
}

export const useVisualStore = defineStore('visualStore', () => {
  const host = shallowRef<powerbi.extensibility.visual.IVisualHost>()
  const isViewerInitialized = ref<boolean>(false)
  const isViewerReadyToInitialize = ref<boolean>(false)
  const viewerReloadNeeded = ref<boolean>(false)
  const fieldInputState = ref<FieldInputState>({
    viewerData: false,
    objectIds: false,
    colorBy: false,
    tooltipData: false
  })

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

  const lastLoadedRootObjectId = ref<string>()

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

  // MAKE TS HAPPY
  type SpeckleObject = {
    id: string
  }

  /**
   * Sets upcoming data input into store to be able to pass it through viewer by evaluating the data.
   * @param newValue new data input that user dragged and dropped to the fields in visual
   */
  const setDataInput = (newValue: SpeckleDataInput) => {
    dataInput.value = newValue

    // here we have to check upcoming data is require viewer to force update! like a new model or some explicit force..
    if (viewerReloadNeeded.value || !lastLoadedRootObjectId.value) {
      lastLoadedRootObjectId.value = (dataInput.value.objects[0] as SpeckleObject).id
      console.log(
        `🔄 Forcing viewer re-render for new root object with ${lastLoadedRootObjectId.value} id.`
      )
      viewerReloadNeeded.value = false
      viewerEmit.value('loadObjects', dataInput.value.objects)
    } else {
      if (dataInput.value.selectedIds.length > 0) {
        viewerEmit.value('isolateObjects', dataInput.value.selectedIds)
      } else {
        viewerEmit.value('isolateObjects', dataInput.value.objectIds)
      }
      viewerEmit.value('colorObjectsByGroup', dataInput.value.colorByIds)
    }
  }

  const setFieldInputState = (newFieldInputState: FieldInputState) => {
    fieldInputState.value = newFieldInputState
    console.log(fieldInputState.value, 'fieldInputState.value')

    if (!fieldInputState.value.viewerData && !fieldInputState.value.objectIds) {
      setInputStatus('incomplete')
    }
    if (!isViewerInitialized.value) {
      if (
        fieldInputState.value.viewerData &&
        fieldInputState.value.objectIds &&
        !fieldInputState.value.tooltipData &&
        !fieldInputState.value.colorBy
      ) {
        viewerReloadNeeded.value = true
      }
    }
  }

  /**
   * Sets input status as flags `viewerReloadNeeded` if the new status is not 'valid'
   */
  const setInputStatus = (newValue: InputState) => {
    dataInputStatus.value = newValue
    if (dataInputStatus.value !== 'valid') {
      viewerReloadNeeded.value = true
    }
  }

  const clearDataInput = () => {
    dataInput.value = null
  }

  return {
    host,
    isViewerInitialized,
    viewerReloadNeeded,
    dataInput,
    dataInputStatus,
    viewerEmit,
    setHost,
    setViewerEmitter,
    setDataInput,
    setFieldInputState,
    setInputStatus,
    clearDataInput
  }
})
