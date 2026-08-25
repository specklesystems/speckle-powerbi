<template>
  <div class="flex items-start">
    <ViewerControlsButtonGroup>
      <!-- Zoom extents -->
      <ViewerControlsButtonToggle tooltip="Zoom extents" @click="onZoomExtentsClicked">
        <IconFocus class="h-4 w-4" />
      </ViewerControlsButtonToggle>
      <!-- -mx-1 bleeds the rule through the pill's padding so it cuts edge to
           edge; dimmed a notch so it reads as a group break, not the border -->
      <div class="-mx-1 self-stretch border-t border-outline-2 opacity-60" aria-hidden="true" />
      <!-- Camera -->
      <ViewerCameraMenu
        :open="cameraOpen"
        :views="views"
        @update:open="(value) => toggleActiveControl(value ? 'camera' : 'none')"
        @view-clicked="(view) => $emit('view-clicked', view)"
      />
    </ViewerControlsButtonGroup>
  </div>
</template>

<script setup lang="ts">
import { CanonicalView, SpeckleView } from '@src/viewer3/compatTypes'
import { computed, ref } from 'vue'
import { useVisualStore } from '@src/store/visualStore'
import ViewerControlsButtonGroup from './viewer/controls/ViewerControlsButtonGroup.vue'
import ViewerControlsButtonToggle from './viewer/controls/ViewerControlsButtonToggle.vue'

import ViewerCameraMenu from './viewer/camera/ViewerCameraMenu.vue'

import IconFocus from '../components/global/icon/lucide/Focus.vue'

const visualStore = useVisualStore()

const emits = defineEmits<{
  (e: 'view-clicked', view: CanonicalView | SpeckleView): void
  (e: 'clear-palette'): void
}>()
defineProps<{ views: SpeckleView[] }>()

type ActiveControl =
  | 'none'
  | 'camera'
  | 'sun'
  | 'projection'
  | 'explode'
  | 'settings'

const activeControl = ref<ActiveControl>('none')

const onZoomExtentsClicked = (ev: MouseEvent) => {
  visualStore.viewerEmit('zoomExtends')
}

const toggleActiveControl = (control: ActiveControl) => {
  activeControl.value = activeControl.value === control ? 'none' : control
}

const cameraOpen = computed(() => activeControl.value === 'camera')
</script>
