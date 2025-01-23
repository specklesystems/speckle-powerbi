<template>
  <ViewerView v-if="visualStore.isViewerReadyToLoad" />
  <HomeView v-else />
</template>

<script setup lang="ts">
import HomeView from './views/HomeView.vue'
import ViewerView from './views/ViewerView.vue'
import { onMounted } from 'vue'
import { useVisualStore } from './store/visualStore'

const visualStore = useVisualStore()

onMounted(() => {
  console.log('App mounted')
})
</script>
