<template>
  <nav
    class="fixed top-0 h-9 flex items-center bg-foundation border-b border-outline-2 w-full transition z-20 hover:shadow cursor-default"
  >
    <div class="flex items-center transition-all justify-between w-full">
      <div class="flex items-center hover:cursor-pointer" @click="goToSpeckleWebsite">
        <div class="max-[200px]:hidden block ml-2">
          <img class="w-6 h-auto mx-2 my-1" src="@assets/logo-big.png" />
        </div>
        <div class="font-semibold">Speckle</div>
      </div>

      <!-- <div class="font-thin text-xs mr-2">v1.0.0</div> -->
    </div>
    <div
      v-if="!isInteractive"
      class="absolute top-1 left-1/2 -translate-x-1/2 z-20 bg-white bg-opacity-70 text-black text-center text-xs px-4 py-1 rounded shadow font-medium"
    >
      <strong>Object IDs</strong>
      field is needed for interactivity with other visuals.
    </div>
  </nav>

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
import { computed } from 'vue'
import LoadingBar from '@src/components/loading/LoadingBar.vue'

const visualStore = useVisualStore()

const isInteractive = computed(
  () => visualStore.fieldInputState.rootObjectId && visualStore.fieldInputState.objectIds
)

console.log(isInteractive.value)

const goToSpeckleWebsite = () => visualStore.host.launchUrl('https://speckle.systems')
</script>
