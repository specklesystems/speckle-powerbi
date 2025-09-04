<template>
  <div
    v-if="visualStore.loadingProgress"
    class="absolute top-1/2 left-1/2 w-1/2 -translate-x-1/2 z-50 text-center text-sm"
  >
    <!-- Progress Bar -->
    <LoadingBar :progress="visualStore.loadingProgress"></LoadingBar>
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
import LoadingBar from '@src/components/loading/LoadingBar.vue'

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
