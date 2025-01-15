<template>
  <ViewerView v-if="status === 'valid'" />
  <HomeView v-else />
</template>

<script setup lang="ts">
import HomeView from './views/HomeView.vue'
import ViewerView from './views/ViewerView.vue'
import { computed, onMounted } from 'vue'
import { useVisualStore } from './store/visualStore'

const visualStore = useVisualStore()
let status = computed(() => {
  return visualStore.dataInputStatus
})

onMounted(() => {
  console.log('App mounted')
})
</script>
