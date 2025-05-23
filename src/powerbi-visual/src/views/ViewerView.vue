<template>
  <div
    class="absolute top-0 left-0 z-10 cursor-pointer flex items-center"
    @click="goToSpeckleWebsite"
  >
    <img class="w-8 h-auto mx-2 my-1" src="@assets/logo-big.png" />
    <div class="font-medium">Speckle</div>
  </div>
  <div
    v-if="!isInteractive"
    class="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-white bg-opacity-70 text-black text-center text-sm px-4 py-2 rounded shadow"
  >
    <strong>Object IDs</strong>
    field is needed for interactivity with other visuals.
  </div>

  <div
    v-if="visualStore.loadingProgress"
    class="absolute top-1/2 left-1/2 w-1/2 -translate-x-1/2 z-20 text-center text-sm"
  >
    <!-- Progress Bar -->
    <LoadingBar :loading="!!visualStore.loadingProgress"></LoadingBar>
  </div>

  <viewer-wrapper id="speckle-3d-view" class="h-full w-full"></viewer-wrapper>
</template>

<script setup lang="ts">
import ViewerWrapper from 'src/components/ViewerWrapper.vue'
import { useVisualStore } from '../store/visualStore'
import { computed } from 'vue'
import LoadingBar from '@src/components/loading/LoadingBar.vue'

const visualStore = useVisualStore()

const onlyObjectIdsMissing = computed(
  () => !visualStore.fieldInputState.objectIds && visualStore.fieldInputState.tooltipData
)

const onlyTooltipDataMissing = computed(
  () => visualStore.fieldInputState.objectIds && !visualStore.fieldInputState.tooltipData
)

const bothFieldsMissing = computed(
  () => !visualStore.fieldInputState.objectIds && !visualStore.fieldInputState.tooltipData
)

const isInteractive = computed(
  () => visualStore.fieldInputState.rootObjectId && visualStore.fieldInputState.objectIds
)

console.log(isInteractive.value)

const goToSpeckleWebsite = () => visualStore.host.launchUrl('https://speckle.systems')
</script>
