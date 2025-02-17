<template>
  <div
    id="speckle-home-view"
    class="flex flex-col justify-center items-center h-full w-full text-center space-y-4 p-2"
  >
    <div class="flex flex-col justify-center items-center h-full w-full text-center space-y-4">
      <div class="flex flex-row justify-center items-center space-x-1">
        <div class="flex justify-center items-center">
          <img src="@assets/logo-big.png" alt="Logo" class="w-16" />
        </div>
        <div
          class="bg-gradient-to-r from-blue-500 via-blue-400 to-blue-600 inline-block py-1 text-transparent bg-clip-text text-2xl"
        >
          <p>
            <b>Speckle</b>
            for
            <b>PowerBI</b>
          </p>
        </div>
      </div>
      <div class="flex flex-col justify-center space-y-1">
        <div class="flex flex-row space-x-2">
          <EyeIcon class="w-6"></EyeIcon>
          <p><b>Version Object ID</b></p>
          <ArrowRightIcon class="w-4"></ArrowRightIcon>
          <p>View your model</p>
        </div>
        <div class="flex flex-row space-x-2">
          <CursorArrowRippleIcon class="w-6"></CursorArrowRippleIcon>
          <p><b>Object IDs</b></p>
          <ArrowRightIcon class="w-4"></ArrowRightIcon>
          <p>Highlighting and interactivity</p>
        </div>
        <div class="flex flex-row space-x-2">
          <ChatBubbleLeftIcon class="w-6"></ChatBubbleLeftIcon>
          <p><b>Tooltip Data</b></p>
          <ArrowRightIcon class="w-4"></ArrowRightIcon>
          <p>Tooltip and interactivity</p>
        </div>
      </div>
    </div>
    <div class="flex justify-end gap-1">
      <button :class="buttonClass" @click="goToGuide">Getting started</button>
      <button :class="buttonClass" @click="goToForum">Help</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVisualStore } from '../store/visualStore'
import {
  EyeIcon,
  ArrowRightIcon,
  CursorArrowRippleIcon,
  ChatBubbleLeftIcon
} from '@heroicons/vue/24/outline'

const visualStore = useVisualStore()

const buttonClass = `btn p-2 rounded-md bg-primary-muted border-transparent font-medium 
  hover:bg-gray-200 hover:shadow-md
  disabled:hover:bg-transparent focus-visible:border-foundation transition-all duration-150`

function goToForum() {
  visualStore.host.launchUrl('https://speckle.community/tag/powerbi')
}

function goToGuide() {
  visualStore.host.launchUrl('https://speckle.guide/user/powerbi')
}
</script>
