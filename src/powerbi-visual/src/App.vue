<template>
  <!-- Advanced Edit configuration: wins visually over loading, error, home and
       viewer states; the subtree below stays mounted so background loading
       continues -->
  <ConfigView v-if="visualStore.isAdvancedEditMode" />

  <!-- Blocking-phase indicator: a bare spinner — the phase TEXT lives in the
       bottom-left status pill (ViewerWrapper), one home for all loading state -->
  <div
    v-if="visualStore.loadingProgress && !visualStore.isAdvancedEditMode"
    class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
  >
    <div
      class="w-8 h-8 rounded-full border-[3px] border-blue-500/25 border-t-blue-500 animate-spin"
    ></div>
  </div>

  <div
    v-if="visualStore.commonError && !visualStore.isAdvancedEditMode"
    class="absolute top-11 left-1/2 -translate-x-1/2 z-100 bg-white bg-opacity-70 text-black text-center text-sm px-4 py-1 rounded shadow font-medium cursor-default"
  >
    {{ visualStore.commonError }}
  </div>

  <!-- visibility (not display) hiding: the WebGPU canvas keeps its layout size,
       so leaving Edit needs no re-measure, and fixed-position viewer chrome
       inherits the hiding instead of escaping it -->
  <div
    class="h-full w-full"
    :class="{ 'invisible pointer-events-none': visualStore.isAdvancedEditMode }"
  >
    <ViewerView v-if="visualStore.isViewerReadyToLoad" />
    <HomeView v-else />
  </div>
</template>

<script setup lang="ts">
import ConfigView from './views/ConfigView.vue'
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
/* Self-contained theme (tippy.js/dist/tippy.css is never imported): mirrors
   frontend-3's tooltip chrome — white chip, 12px text, 1px ring, soft shadow */
.tippy-box[data-theme~='custom'] {
  background-color: #ffffff;
  color: #1a1a1a;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  border-radius: 4px;
  box-shadow:
    0 0 0 1px #dfdfdf,
    0 1px 2px 0 rgb(0 0 0 / 0.05);
  text-align: center;
}
.tippy-box[data-theme~='custom'] .tippy-content {
  padding: 4px 8px;
}
</style>
