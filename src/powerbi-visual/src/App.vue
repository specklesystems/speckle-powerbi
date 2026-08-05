<template>
  <!-- Blocking-phase indicator: a bare spinner — the phase TEXT lives in the
       bottom-left status pill (ViewerWrapper), one home for all loading state -->
  <div
    v-if="visualStore.loadingProgress"
    class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
  >
    <div
      class="w-8 h-8 rounded-full border-[3px] border-blue-500/25 border-t-blue-500 animate-spin"
    ></div>
  </div>

  <div
    v-if="visualStore.commonError"
    class="absolute top-11 left-1/2 -translate-x-1/2 z-100 bg-white bg-opacity-70 text-black text-center text-sm px-4 py-1 rounded shadow font-medium cursor-default"
  >
    {{ visualStore.commonError }}
  </div>

  <ViewerView v-if="visualStore.isViewerReadyToLoad" />
  <HomeView v-else />
</template>

<script setup lang="ts">
import HomeView from './views/HomeView.vue'
import ViewerView from './views/ViewerView.vue'
import { onMounted } from 'vue'
import { useVisualStore } from './store/visualStore'

const visualStore = useVisualStore()

onMounted(() => {
  console.log('App mounted')
})
</script>

<style>
.tippy-box[data-theme~='custom'] {
  font-size: 10px;
  padding: 0px 0px;
  border-radius: 4px;
  text-align: center;
}
</style>
