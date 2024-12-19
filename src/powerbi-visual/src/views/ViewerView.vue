<template>
  <div class="absolute top-0 left-0 z-10" @click="goToSpeckleWebsite">
    <img class="w-16 h-auto mt-1 mr-1 cursor-pointer" src="@assets/powered-by-speckle.png" />
  </div>
  <viewer-wrapper id="speckle-3d-view" class="h-full w-full"></viewer-wrapper>
</template>

<script setup lang="ts">
import ViewerWrapper from 'src/components/ViewerWrapper.vue'
import { useVisualStore } from '../store/visualStore'

const visualStore = useVisualStore()

const goToSpeckleWebsite = () => visualStore.host.launchUrl('https://speckle.systems')
</script>
