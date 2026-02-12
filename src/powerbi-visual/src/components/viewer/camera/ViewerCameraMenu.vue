<template>
  <ViewerMenu v-model:open="open">
    <template #trigger-icon>
      <VideoCameraIcon class="w-5 h-5" />
    </template>
    <template #title>Camera</template>
    <div class="flex flex-col p-1.5 min-w-[180px] space-y-0.5">
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

      <div class="w-full border-b border-outline-2 my-1"></div>

      <div class="text-body-2xs font-semibold text-foreground-2 px-2 py-1">Views</div>

      <ViewerMenuItem
        v-for="shortcut in viewShortcuts"
        :key="shortcut.name"
        :label="shortcut.name"
        hide-active-tick
        :active="false"
        @click="handleViewChange(shortcut.name.toLowerCase() as CanonicalView)"
      />

      <div v-if="views.length !== 0" class="w-full border-b border-outline-2 my-1"></div>

      <ViewerMenuItem
        v-for="view in views"
        :key="view.id"
        hide-active-tick
        :active="false"
        :label="view.name ? view.name : view.id"
        @click="handleViewChange(view)"
      />
    </div>
  </ViewerMenu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { VideoCameraIcon } from '@heroicons/vue/24/outline'
import type { CanonicalView, SpeckleView } from '@speckle/viewer'
import { useVisualStore } from '@src/store/visualStore'
import ViewerMenu from '../menu/ViewerMenu.vue'
import ViewerMenuItem from '../menu/ViewerMenuItem.vue'
import { ViewShortcuts } from '@src/helpers/viewer/shortcuts/shortcuts'

const visualStore = useVisualStore()

const props = defineProps<{
  open: boolean
  views: SpeckleView[]
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'view-clicked', value: CanonicalView | SpeckleView): void
}>()

const open = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val)
})

const viewShortcuts = Object.values(ViewShortcuts)

const handleViewChange = (v: CanonicalView | SpeckleView) => {
  emit('view-clicked', v)
}

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
