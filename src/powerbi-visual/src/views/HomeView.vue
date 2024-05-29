<script setup lang="ts">
import { FormButton } from '@speckle/ui-components'
import { inject } from 'vue'
import { hostKey } from 'src/injectionKeys'

const host = inject(hostKey)

function goToForum() {
  host.launchUrl('https://speckle.community/tag/powerbi')
}

function goToGuide() {
  host.launchUrl('https://speckle.guide/user/powerbi')
}
</script>

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
      <FormButton color="invert" @click="goToGuide">Getting started</FormButton>
    </div>
  </div>
</template>

<style scoped></style>
