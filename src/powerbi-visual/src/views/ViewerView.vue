<script setup lang="ts">
import ViewerWrapper from 'src/components/ViewerWrapper.vue'
import { inject } from 'vue'
import { hostKey } from 'src/injectionKeys'

const host = inject(hostKey)

const goToSpeckleWebsite = () => host.launchUrl('https://speckle.systems')
</script>

<template>
  <div id="overlay">
    <img class="watermark" src="@assets/powered-by-speckle.png" @click="goToSpeckleWebsite" />
  </div>
  <viewer-wrapper id="speckle-3d-view" class="h-full w-full"></viewer-wrapper>
</template>

<style scoped>
.watermark {
  height: auto;
  width: 60pt;
  margin-top: 3pt;
  margin-right: 3pt;
}

.watermark:hover {
  cursor: pointer;
}

#overlay {
  position: absolute;
  width: 100%;
  z-index: 100;
}
</style>
