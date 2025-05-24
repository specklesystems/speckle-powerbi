<template>
  <div>
    <ViewerControlsButtonGroup>
      <!-- Zoom extend -->
      <ViewerControlsButtonToggle v-tippy="'Zoom extends'" flat @click="onZoomExtentsClicked">
        <ArrowsPointingOutIcon class="h-4 w-4 md:h-5 md:w-5" />
      </ViewerControlsButtonToggle>
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
    </ViewerControlsButtonGroup>
  </div>
</template>

<script setup lang="ts">
import { ArrowsPointingOutIcon } from '@heroicons/vue/24/solid'
import { CanonicalView, SpeckleView, ViewMode } from '@speckle/viewer'
import { computed, ref } from 'vue'
import { resetPalette } from 'src/utils/matrixViewUtils'
import { useVisualStore } from '@src/store/visualStore'
import ViewerControlsButtonGroup from './viewer/controls/ViewerControlsButtonGroup.vue'
import ViewerControlsButtonToggle from './viewer/controls/ViewerControlsButtonToggle.vue'

import ViewerViewModesMenu from './viewer/view-modes/ViewerViewModesMenu.vue'
import ViewerViewsMenu from './viewer/views/ViewerViewsMenu.vue'

const visualStore = useVisualStore()

const emits = defineEmits([
  'update:sectionBox',
  'view-clicked',
  'clear-palette',
  'view-mode-clicked'
])
const props = withDefaults(defineProps<{ sectionBox: boolean; views: SpeckleView[] }>(), {
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

const canonicalViews = [
  { name: 'Top' },
  { name: 'Front' },
  { name: 'Left' },
  { name: 'Back' },
  { name: 'Right' }
]

const viewModes = {
  [ViewMode.DEFAULT]: 'Default',
  [ViewMode.DEFAULT_EDGES]: 'Edges',
  [ViewMode.SHADED]: 'Shaded',
  [ViewMode.PEN]: 'Pen',
  [ViewMode.ARCTIC]: 'Arctic',
  [ViewMode.COLORS]: 'Colors'
}

const handleCameraViewChange = (view: CanonicalView | SpeckleView) => {
  emits('view-clicked', view)
  // visualStore.writeCameraViewToFile(view)
}

const handleCameraViewModeChange = (viewMode: ViewMode) => {
  emits('view-mode-clicked', viewMode)
  visualStore.writeViewModeToFile(viewMode)
}

const onZoomExtentsClicked = (ev: MouseEvent) => {
  visualStore.viewerEmit('zoomExtends')
}

const onClearPalletteClicked = (ev: MouseEvent) => {
  console.log('Clear pallette clicked')
  resetPalette()
  emits('clear-palette')
}

const toggleActiveControl = (control: ActiveControl) => {
  activeControl.value = activeControl.value === control ? 'none' : control
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
