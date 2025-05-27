<template>
  <div
    v-if="visualStore.loadingProgress"
    class="absolute top-1/2 left-1/2 w-1/2 -translate-x-1/2 z-20 text-center text-sm"
  >
    <!-- Progress Bar -->
    <LoadingBar :loading="!!visualStore.loadingProgress"></LoadingBar>
  </div>

  <viewer-wrapper id="speckle-3d-view" class="h-full w-full cursor-default"></viewer-wrapper>
</template>

<script setup lang="ts">
import ViewerWrapper from 'src/components/ViewerWrapper.vue'
import { useVisualStore } from '../store/visualStore'
import LoadingBar from '@src/components/loading/LoadingBar.vue'

const visualStore = useVisualStore()
</script>
