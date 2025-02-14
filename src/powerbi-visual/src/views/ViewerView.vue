<template>
  <div class="absolute top-0 left-0 z-10" @click="goToSpeckleWebsite">
    <img class="w-16 h-auto mt-1 mr-1 cursor-pointer" src="@assets/powered-by-speckle.png" />
  </div>
  <div
    v-if="isInteractive"
    class="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-white bg-opacity-70 text-black text-center text-sm px-4 py-2 rounded shadow"
  >
    <div v-if="bothFieldsMissing">
      <strong>Object IDs</strong>
      and
      <strong>Tooltip Data</strong>
      fields are needed for interactivity.
    </div>
    <div v-else-if="onlyObjectIdsMissing">
      <strong>Object IDs</strong>
      field is needed for interactivity.
    </div>
    <div v-else-if="onlyTooltipDataMissing">
      <strong>Tooltip Data</strong>
      field is needed for interactivity.
    </div>
  </div>

  <div
    v-if="visualStore.loadingProgress"
    class="absolute top-1/2 left-1/2 w-1/2 -translate-x-1/2 z-20 text-center text-sm"
  >
    <!-- Progress Bar -->
    <div
      v-if="visualStore.loadingProgress"
      class="absolute left-1/2 -translate-x-1/2 w-1/2 bg-gray-300 rounded-full h-3 shadow-lg"
    >
      <div
        class="bg-blue-600 h-full rounded-full transition-all"
        :style="{ width: visualStore.loadingProgress.progress * 100 + '%' }"
      ></div>
    </div>
    <div class="mt-4 text-blue-600">
      {{ Math.round(visualStore.loadingProgress.progress * 100) + ' %' }}
    </div>
  </div>

  <viewer-wrapper id="speckle-3d-view" class="h-full w-full"></viewer-wrapper>
</template>

<script setup lang="ts">
import ViewerWrapper from 'src/components/ViewerWrapper.vue'
import { useVisualStore } from '../store/visualStore'
import { computed } from 'vue'

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
  () => !visualStore.fieldInputState.objectIds || !visualStore.fieldInputState.tooltipData
)

const goToSpeckleWebsite = () => visualStore.host.launchUrl('https://speckle.systems')
</script>
