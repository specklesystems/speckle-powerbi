<template>
  <div class="space-y-2">
    <ViewerControlsButtonGroup>
      <!-- Zoom extend -->
      <ViewerControlsButtonToggle flat tooltip="Zoom extends" @click="onZoomExtentsClicked">
        <ArrowsPointingOutIcon class="h-4 w-4 md:h-5 md:w-5" />
      </ViewerControlsButtonToggle>
      <!-- Ghost / Hidden -->
      <ViewerControlsButtonToggle
        :tooltip="
          visualStore.isGhostActive
            ? 'Hide ghosted objects on filter'
            : 'Show ghosted objects on filter'
        "
        flat
        @click="toggleGhostHidden"
      >
        <Ghost v-if="visualStore.isGhostActive" class="h-5 w-5" />
        <Ghost v-else class="h-5 w-5 opacity-30" />
      </ViewerControlsButtonToggle>
      <!-- Zoom on Filter -->
      <ViewerControlsButtonToggle
        :tooltip="
          visualStore.isZoomOnFilterActive
            ? 'Zoom to objects on filter'
            : 'Keep camera position on filter'
        "
        flat
        @click="toggleZoomOnFilter"
      >
        <HandZoom v-if="visualStore.isZoomOnFilterActive" class="h-5 w-5" />
        <HandZoom v-else class="h-5 w-5 opacity-30" />
      </ViewerControlsButtonToggle>
    </ViewerControlsButtonGroup>
    <ViewerControlsButtonGroup>
      <!-- View Modes -->
      <ViewerViewModesMenu
        :open="viewModesOpen"
        @force-close-others="activeControl = 'none'"
        @update:open="(value) => toggleActiveControl(value ? 'viewModes' : 'none')"
        @view-mode-clicked="(value) => $emit('view-mode-clicked', value)"
      />
      <!-- Views -->
      <ViewerViewsMenu
        :open="viewsOpen"
        :views="views"
        @force-close-others="activeControl = 'none'"
        @update:open="(value) => toggleActiveControl(value ? 'views' : 'none')"
        @view-clicked="(view) => $emit('view-clicked', view)"
      />
      <!-- Perspective/Ortho -->
      <ViewerControlsButtonToggle
        flat
        secondary
        tooltip="Projection"
        :active="visualStore.isOrthoProjection"
        @click="toggleProjection"
      >
        <Perspective v-if="visualStore.isOrthoProjection" class="h-3.5 md:h-4 w-4" />
        <PerspectiveMore v-else class="h-3.5 md:h-4 w-4" />
      </ViewerControlsButtonToggle>
    </ViewerControlsButtonGroup>
  </div>
</template>

<script setup lang="ts">
import { ArrowsPointingOutIcon } from '@heroicons/vue/24/solid'
import { SpeckleView } from '@speckle/viewer'
import { computed, ref } from 'vue'
import { useVisualStore } from '@src/store/visualStore'
import ViewerControlsButtonGroup from './viewer/controls/ViewerControlsButtonGroup.vue'
import ViewerControlsButtonToggle from './viewer/controls/ViewerControlsButtonToggle.vue'

import ViewerViewModesMenu from './viewer/view-modes/ViewerViewModesMenu.vue'
import ViewerViewsMenu from './viewer/views/ViewerViewsMenu.vue'

import Perspective from '../components/global/icon/Perspective.vue'
import PerspectiveMore from '../components/global/icon/PerspectiveMore.vue'

import Ghost from '../components/global/icon/Ghost.vue'
import HandZoom from '../components/global/icon/HandZoom.vue'

const visualStore = useVisualStore()

const emits = defineEmits([
  'update:sectionBox',
  'view-clicked',
  'toggle-projection',
  'clear-palette',
  'view-mode-clicked'
])
withDefaults(defineProps<{ sectionBox: boolean; views: SpeckleView[] }>(), {
  sectionBox: false
})

type ActiveControl =
  | 'none'
  | 'viewModes'
  | 'views'
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

const viewModesOpen = computed({
  get: () => activeControl.value === 'viewModes',
  set: (value) => {
    activeControl.value = value ? 'viewModes' : 'none'
  }
})

const viewsOpen = computed({
  get: () => activeControl.value === 'views',
  set: (value) => {
    activeControl.value = value ? 'views' : 'none'
  }
})
</script>
