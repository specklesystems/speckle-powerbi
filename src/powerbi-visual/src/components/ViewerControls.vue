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
      <!-- View Modes Toggle -->
      <div class="relative">
        <ViewerControlsButtonToggle
          tooltip="View modes"
          :active="viewModesOpen"
          @click="toggleActiveControl('viewModes')"
        >
          <ViewModesIcon class="h-4 w-4" />
        </ViewerControlsButtonToggle>
        <!-- View Modes Panel (shown when glasses icon is clicked) -->
        <ViewerViewModesMenu
          v-if="viewModesOpen"
          @view-mode-clicked="(viewMode, options) => $emit('view-mode-clicked', viewMode, options)"
        />
      </div>
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
import { CanonicalView, SpeckleView, ViewMode } from '@src/viewer3/compatTypes'
import { computed, ref } from 'vue'
import { useVisualStore } from '@src/store/visualStore'
import ViewerControlsButtonGroup from './viewer/controls/ViewerControlsButtonGroup.vue'
import ViewerControlsButtonToggle from './viewer/controls/ViewerControlsButtonToggle.vue'

import ViewerCameraMenu from './viewer/camera/ViewerCameraMenu.vue'
import ViewerViewModesMenu from './viewer/view-modes/ViewerViewModesMenu.vue'

import IconFocus from '../components/global/icon/lucide/Focus.vue'
import ViewModesIcon from '../components/global/icon/ViewModes.vue'
import type { ViewModeOptions } from '@src/plugins/viewer'

const visualStore = useVisualStore()

const emits = defineEmits<{
  (e: 'view-clicked', view: CanonicalView | SpeckleView): void
  (e: 'clear-palette'): void
  (e: 'view-mode-clicked', viewMode: ViewMode, options: ViewModeOptions): void
}>()
defineProps<{ views: SpeckleView[] }>()

type ActiveControl =
  | 'none'
  | 'viewModes'
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

const viewModesOpen = computed(() => activeControl.value === 'viewModes')
const cameraOpen = computed(() => activeControl.value === 'camera')
</script>
