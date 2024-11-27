<template>
  <div
    id="speckle-home-view"
    class="flex flex-col justify-center items-center h-full w-full bg-primary text-center text-foundation"
  >
    <div class="flex justify-center items-center">
      <img src="@assets/logo-white.png" alt="Logo" class="w-1/3" />
    </div>
    <p class="heading">Speckle PowerBI 3D Visual</p>
    <div class="flex justify-center mt-2 gap-1">
      <FormButton color="invert" @click="goToForum">Help</FormButton>
      <FormButton color="invert" @click="goToGuide">Getting started 2</FormButton>
      {{ store.visualState.status }}
      <FormButton color="invert" @click="store.setInputState('valid')">Update visual state status</FormButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FormButton } from '@speckle/ui-components'
import { inject } from 'vue'
import { hostKey } from 'src/injectionKeys'
import { useStore } from '@src/store';

const host = inject(hostKey)

const store = useStore()

function goToForum() {
  host.launchUrl('https://speckle.community/tag/powerbi')
}

function goToGuide() {
  host.launchUrl('https://speckle.guide/user/powerbi')
}
</script>



<style scoped></style>
