<template>
  <div
    id="speckle-home-view"
    class="flex flex-col justify-center items-center h-full w-full bg-primary text-center text-foundation">
    <div class="flex justify-center items-center">
      <img src="@assets/logo-white.png" alt="Logo" class="w-1/3" />
    </div>
    <p class="heading">Speckle PowerBI 3D Visual</p>
    <div class="flex justify-center mt-2 gap-1">
      <button class="btn p-2 rounded-md bg-transparent border-transparent text-foreground font-medium hover:bg-primary-muted disabled:hover:bg-transparent focus-visible:border-foundation" @click="goToForum">Help</button>
      <button class="btn p-2 rounded-md bg-transparent border-transparent text-foreground font-medium hover:bg-primary-muted disabled:hover:bg-transparent focus-visible:border-foundation" @click="goToGuide">Getting started</button>
      <!-- TODO: dependency issue need to be resolved to be able to use ui-components library
      <FormButton color="invert" @click="goToForum">Help</FormButton>
      <FormButton color="invert" @click="goToGuide">Getting started</FormButton>
      -->
    </div>
  </div>
</template>

<script setup lang="ts">
// import { FormButton } from '@speckle/ui-components'
import { useVisualStore } from '../store/visualStore'

const visualStore = useVisualStore()

function goToForum() {
  visualStore.host.launchUrl('https://speckle.community/tag/powerbi')
}

function goToGuide() {
  visualStore.host.launchUrl('https://speckle.guide/user/powerbi')
}
</script>
