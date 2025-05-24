<template>
  <transition name="slide-fade">
    <nav
      v-show="!isNavbarCollapsed"
      class="fixed top-0 h-9 flex items-center bg-foundation border-b border-outline-2 w-full transition z-20 hover:shadow cursor-default"
    >
      <div class="flex items-center transition-all justify-between w-full">
        <div class="flex items-center hover:cursor-pointer" @click="goToSpeckleWebsite">
          <div class="max-[200px]:hidden block ml-2">
            <img class="w-6 h-auto mx-2 my-1" src="@assets/logo-big.png" />
          </div>
          <div class="font-sans font-medium">Speckle</div>
        </div>

        <div class="flex items-center">
          <div class="font-thin text-xs mr-2 text-gray-400">v1.0.0</div>
          <button
            class="text-gray-400 hover:text-gray-700 transition"
            title="Hide navbar"
            @click="isNavbarCollapsed = true"
          >
            <ChevronUpIcon class="w-4 h-4" />
          </button>
        </div>
      </div>
    </nav>
  </transition>

  <div
    v-if="!isInteractive"
    class="absolute top-1 left-1/2 -translate-x-1/2 z-20 bg-white bg-opacity-70 text-black text-center text-xs px-4 py-1 rounded shadow font-medium"
  >
    <strong>Object IDs</strong>
    field is needed for interactivity with other visuals.
  </div>

  <div v-if="isNavbarCollapsed" class="fixed top-2 right-0 z-20">
    <button
      class="transition opacity-50 hover:opacity-100"
      title="Show navbar"
      @click="isNavbarCollapsed = false"
    >
      <ChevronDownIcon class="w-4 h-4 text-gray-400" />
    </button>
  </div>

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
import { computed, ref } from 'vue'
import LoadingBar from '@src/components/loading/LoadingBar.vue'

import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/vue/24/outline'

const visualStore = useVisualStore()

const isNavbarCollapsed = ref(false)

const isInteractive = computed(
  () => visualStore.fieldInputState.rootObjectId && visualStore.fieldInputState.objectIds
)

const goToSpeckleWebsite = () => visualStore.host.launchUrl('https://speckle.systems')
</script>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
.slide-fade-enter-to,
.slide-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
