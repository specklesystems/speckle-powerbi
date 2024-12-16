
// import { SpeckleDataInput } from 'src/types'
// import { SpeckleVisualSettingsModel } from 'src/settings/visualSettingsModel'

// export interface SpeckleVisualState {
//   input?: SpeckleDataInput
//   status: InputState
//   settings: SpeckleVisualSettingsModel
// }

// // Create a new store instance.
// export const store = createStore<SpeckleVisualState>({
//   state() {
//     return {
//       input: null,
//       status: 'incomplete',
//       settings: null
//     }
//   },
//   mutations: {
//     setInput(state, input?: SpeckleDataInput) {
//       state.input = input
//     },
//     setStatus(state, status: InputState) {
//       state.status = status ?? 'invalid'
//     },
//     setSettings(state, settings: SpeckleVisualSettingsModel) {
//       state.settings = settings
//     },
//     clearInput(state) {
//       state.input = null
//     }
//   },
//   actions: {
//     update(context, status: InputState, input?: SpeckleDataInput) {
//       context.commit('setInput', input)
//       context.commit('setStatus', status)
//     }
//   }
// })

import { SpeckleDataInput } from '@src/types'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type InputState = 'valid' | 'incomplete' | 'invalid'

export const useVisualStore = defineStore('visualStore', () => { 
  const host = ref<powerbi.extensibility.visual.IVisualHost>(null)
  
  const dataInput = ref<SpeckleDataInput | null>(null)
  const dataInputStatus = ref<InputState>('incomplete')

  const setHost = (hostToSet: powerbi.extensibility.visual.IVisualHost) => {
    host.value = hostToSet
  }

  const setDataInput = (newValue: SpeckleDataInput) => {
    dataInput.value = newValue
  }

  const setInputStatus = (newValue: InputState) => {
    dataInputStatus.value = newValue
  }

  const clearDataInput = () => {
    dataInput.value = null
  }

  return {
    host,
    dataInput,
    dataInputStatus,
    setHost,
    setDataInput,
    setInputStatus,
    clearDataInput
  }
})