import { createStore } from 'vuex'
import { SpeckleDataInput } from 'src/types'
import { SpeckleVisualSettingsModel } from 'src/settings/visualSettingsModel'
export type InputState = 'valid' | 'incomplete' | 'invalid'

export interface SpeckleVisualState {
  input?: SpeckleDataInput
  status: InputState
  settings: SpeckleVisualSettingsModel
}

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
