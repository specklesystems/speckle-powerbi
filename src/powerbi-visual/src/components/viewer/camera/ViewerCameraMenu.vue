<template>
  <ViewerMenu v-model:open="open" title="Camera">
    <template #trigger-icon>
      <VideoCameraIcon class="w-5 h-5" />
    </template>
    <template #title>Camera</template>
    <div class="flex flex-col p-1.5 min-w-[180px]">
      <ViewerMenuItem
        label="Orthographic projection"
        :active="visualStore.isOrthoProjection"
        @click="toggleProjection"
      />
      <ViewerMenuItem
        label="Move camera on filter"
        :active="visualStore.isZoomOnFilterActive"
        @click="toggleZoomOnFilter"
      />
      <ViewerMenuItem
        label="Ghost filtered objects"
        :active="visualStore.isGhostActive"
        @click="toggleGhostHidden"
      />
    </div>
  </ViewerMenu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { VideoCameraIcon } from '@heroicons/vue/24/outline'
import { useVisualStore } from '@src/store/visualStore'
import ViewerMenu from '../menu/ViewerMenu.vue'
import ViewerMenuItem from '../menu/ViewerMenuItem.vue'

const visualStore = useVisualStore()

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const open = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val)
})

const toggleProjection = () => {
  visualStore.viewerEmit('toggleProjection')
  visualStore.setIsOrthoProjection(!visualStore.isOrthoProjection)
  visualStore.writeIsOrthoToFile()
}

const toggleGhostHidden = () => {
  visualStore.setIsGhost(!visualStore.isGhostActive)
  visualStore.viewerEmit('toggleGhostHidden', visualStore.isGhostActive)
  visualStore.writeIsGhostToFile()
}

const toggleZoomOnFilter = () => {
  visualStore.setIsZoomOnFilterActive(!visualStore.isZoomOnFilterActive)
  visualStore.writeZoomOnFilterToFile()
}
</script>
