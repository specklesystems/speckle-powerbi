<template>
  <div class="space-y-2">
    <ViewerControlsButtonGroup>
      <!-- Zoom extend -->
      <ViewerControlsButtonToggle flat tooltip="Zoom extends" @click="onZoomExtentsClicked">
        <ArrowsPointingOutIcon class="h-4 w-4 md:h-5 md:w-5" />
      </ViewerControlsButtonToggle>
    </ViewerControlsButtonGroup>
    <ViewerControlsButtonGroup>
      <!-- View Modes Toggle -->
      <div class="relative">
        <ViewerControlsButtonToggle
          flat
          tooltip="View modes"
          :active="viewModesOpen"
          @click="toggleActiveControl('viewModes')"
        >
          <ViewModesIcon class="h-5 w-5" />
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
      <!-- Section box -->
      <div class="relative">
        <ViewerControlsButtonToggle
          flat
          tooltip="Section box"
          @click="$emit('update:sectionBox')"
        >
          <ScissorsIcon class="h-4 w-4 md:h-5 md:w-5" />
        </ViewerControlsButtonToggle>
        <span
          v-if="sectionBox"
          class="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary pointer-events-none"
        />
      </div>
    </ViewerControlsButtonGroup>
  </div>
</template>

<script setup lang="ts">
import { ArrowsPointingOutIcon, ScissorsIcon } from '@heroicons/vue/24/solid'
import { CanonicalView, SpeckleView, ViewMode } from '@speckle/viewer'
import { computed, ref } from 'vue'
import { useVisualStore } from '@src/store/visualStore'
import ViewerControlsButtonGroup from './viewer/controls/ViewerControlsButtonGroup.vue'
import ViewerControlsButtonToggle from './viewer/controls/ViewerControlsButtonToggle.vue'

import ViewerCameraMenu from './viewer/camera/ViewerCameraMenu.vue'
import ViewerViewModesMenu from './viewer/view-modes/ViewerViewModesMenu.vue'

import ViewModesIcon from '../components/global/icon/ViewModes.vue'
import type { ViewModeOptions } from '@src/plugins/viewer'

const visualStore = useVisualStore()

const emits = defineEmits<{
  (e: 'update:sectionBox', value: boolean): void
  (e: 'view-clicked', view: CanonicalView | SpeckleView): void
  (e: 'clear-palette'): void
  (e: 'view-mode-clicked', viewMode: ViewMode, options: ViewModeOptions): void
}>()
withDefaults(defineProps<{ sectionBox: boolean; views: SpeckleView[] }>(), {
  sectionBox: false
})

type ActiveControl =
  | 'none'
  | 'viewModes'
  | 'camera'
  | 'sun'
  | 'projection'
  | 'sectionBox'
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
