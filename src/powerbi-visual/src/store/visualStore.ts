import { IViewerEvents } from '@src/plugins/viewer'
import { SpeckleDataInput } from '@src/types'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

export type InputState = 'valid' | 'incomplete' | 'invalid'

export const useVisualStore = defineStore('visualStore', () => {
  const host = ref<powerbi.extensibility.visual.IVisualHost>()
  const isViewerInitialized = ref<boolean>(false)
  const reloadNeeded = ref<boolean>(false)

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

  const setHost = (hostToSet: powerbi.extensibility.visual.IVisualHost) => {
    host.value = hostToSet
  }

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

  const setDataInput = (newValue: SpeckleDataInput) => {
    dataInput.value = newValue

    // here we have to check upcoming data is require viewer to force update! like a new model or some explicit force..
    if (
      reloadNeeded.value ||
      !lastLoadedRootObjectId.value ||
      lastLoadedRootObjectId.value !== (dataInput.value.objects[0] as SpeckleObject).id
    ) {
      lastLoadedRootObjectId.value = (dataInput.value.objects[0] as SpeckleObject).id
      console.log(
        `🔄 Forcing viewer re-render for new root object with ${lastLoadedRootObjectId.value} id.`
      )
      reloadNeeded.value = false
      viewerEmit.value('loadObjects', dataInput.value.objects)
    } else {
      if (dataInput.value.selectedIds.length > 0) {
        viewerEmit.value('isolateObjects', dataInput.value.selectedIds)
      } else {
        viewerEmit.value('unIsolateObjects')
      }
    }
  }

  const shouldForceUpdate = (newDataInput: SpeckleDataInput): boolean => {
    // TODO
    return false
  }

  const setInputStatus = (newValue: InputState) => {
    dataInputStatus.value = newValue
    if (dataInputStatus.value !== 'valid') {
      reloadNeeded.value = true
    }
  }

  const clearDataInput = () => {
    dataInput.value = null
  }

  return {
    host,
    isViewerInitialized,
    reloadNeeded,
    dataInput,
    dataInputStatus,
    setHost,
    setViewerEmitter,
    setDataInput,
    setInputStatus,
    clearDataInput
  }
})
