<template>
  <div
    id="speckle-home-view"
    class="flex flex-col justify-center items-center h-full w-full bg-foreground text-center text-foundation"
  >
    <div class="flex justify-center items-center">
      <img src="@assets/logo-white.png" alt="Logo" class="w-1/3" />
    </div>
    <p class="heading">Speckle PowerBI 3D Visual</p>
    <div class="flex justify-center mt-2 gap-1">
      <button :class="buttonClass" @click="goToForum">Help</button>
      <button :class="buttonClass" @click="goToGuide">Getting started</button>
      <!-- <button :class="buttonClass" @click="triggerFileInput">Upload File</button> -->
      <!-- <button :class="buttonClass" @click="getFromLocalServer">Get From Local Server</button> -->
      <!-- TODO: dependency issue need to be resolved to be able to use ui-components library-->
      <!-- <FormButton color="subtle" @click="goToForum">Help</FormButton>
      <FormButton color="subtle" @click="goToGuide">Getting started</FormButton> -->
    </div>
    <input ref="fileInput" type="file" style="display: none" @change="handleFileChange" />
    <!-- <CommonLoadingBar :loading="true"/> -->
  </div>
</template>

<script setup lang="ts">
// import { FormButton } from '@speckle/ui-components'
// import { CommonLoadingBar } from '@speckle/ui-components';
import { useVisualStore } from '../store/visualStore'

const visualStore = useVisualStore()

const buttonClass = `btn p-2 rounded-md bg-transparent border-transparent text-white font-medium hover:bg-primary-muted hover:text-foreground disabled:hover:bg-transparent focus-visible:border-foundation`

function goToForum() {
  visualStore.host.launchUrl('https://speckle.community/tag/powerbi')
}

function goToGuide() {
  visualStore.host.launchUrl('https://speckle.guide/user/powerbi')
}

async function getFromLocalServer() {
  const res = await fetch('http://localhost:8099/get-data/443b8461a3fd1437a983364e9a047778')
  const objects = await res.json()
  visualStore.setViewerReadyToLoad()
  setTimeout(() => {
    visualStore.loadObjectsFromFile(objects)
  }, 250)
  console.log(objects)
}

// Method to programmatically trigger the file input
function triggerFileInput() {
  const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')
  fileInput?.click()
}

// Method to handle file selection
function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    console.log('Selected file:', file.name)
    console.log(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      const fileContent = e.target?.result
      if (fileContent) {
        const visualStore = useVisualStore()
        visualStore.setViewerReadyToLoad()
        setTimeout(() => {
          const objects = JSON.parse(fileContent as string)
          console.log('File content:', objects)
          visualStore.loadObjectsFromFile(objects)
        }, 250)

        // Process the file content (e.g., parse JSON, display text, etc.)
      }
    }
    // Handle errors if any occur
    reader.onerror = (e) => {
      console.error('Error reading file:', e)
    }

    // Read the file as text (you can also use readAsDataURL, readAsBinaryString, etc.)
    reader.readAsText(file)

    // Add logic to process the file as needed
  }
}
</script>
