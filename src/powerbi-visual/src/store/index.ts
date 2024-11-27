import { createStore } from 'vuex'
import { SpeckleDataInput } from 'src/types'
import { SpeckleVisualSettingsModel } from 'src/settings/visualSettingsModel'
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type InputState = 'valid' | 'incomplete' | 'invalid'

export interface SpeckleVisualState {
  input?: SpeckleDataInput
  status: InputState
  settings: SpeckleVisualSettingsModel
}

export const useStore = defineStore('speckleVisualStateStore', () => {
  const visualState = ref<SpeckleVisualState>({
    input: null,
    status: 'incomplete',
    settings: null
  })

  const setSpeckleDataInput = (input?: SpeckleDataInput) => {
    visualState.value.input = input
  }

  const clearSpeckleDataInput = () => {
    visualState.value.input = null
  }

  const setInputState = (status: InputState) => {
    visualState.value.status = status ?? 'invalid'
  }
  
  const setSettings = (settings: SpeckleVisualSettingsModel) => {
    visualState.value.settings = settings
  }

  const updateVisualState = (status: InputState, input?: SpeckleDataInput) => {
    setSpeckleDataInput(input)
    setInputState(status)
  }

  return {
    visualState,
    setSpeckleDataInput,
    clearSpeckleDataInput,
    setInputState,
    setSettings,
    updateVisualState
  }
})

// Create a new store instance.
export const store = createStore<SpeckleVisualState>({
  state() {
    return {
      input: null,
      status: 'incomplete',
      settings: null
    }
  },
  mutations: {
    setInput(state, input?: SpeckleDataInput) {
      state.input = input
    },
    setStatus(state, status: InputState) {
      state.status = status ?? 'invalid'
    },
    setSettings(state, settings: SpeckleVisualSettingsModel) {
      state.settings = settings
    },
    clearInput(state) {
      state.input = null
    }
  },
  actions: {
    update(context, status: InputState, input?: SpeckleDataInput) {
      context.commit('setInput', input)
      context.commit('setStatus', status)
    }
  }
})
