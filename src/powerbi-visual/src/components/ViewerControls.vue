<template>
  <ButtonGroup>
    <ButtonSimple flat secondary @click="onZoomExtentsClicked">
      <ArrowsPointingOutIcon class="h-5 w-5" />
    </ButtonSimple>
    <!-- Canonical Views -->
    <Menu as="div" class="relative z-50">
      <MenuButton v-slot="{ open }" as="template">
        <ButtonToggle flat secondary :active="open">
          <VideoCameraIcon class="h-5 w-5" />
        </ButtonToggle>
      </MenuButton>
      <Transition
        enter-active-class="transform ease-out duration-300 transition"
        enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
        enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
        leave-active-class="transition ease-in duration-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <MenuItems
          class="absolute w-20 left-2 mb-8 bottom-2 bg-foundation max-h-64 simple-scrollbar overflow-y-auto outline outline-2 outline-primary-muted rounded-lg shadow-lg overflow-hidden flex flex-col"
        >
          <MenuItem
            v-for="view in canonicalViews"
            :key="view.name"
            v-slot="{ active }"
            as="template"
          >
            <button
              :class="{
                'bg-primary text-foreground-on-primary': active,
                'text-foreground': !active,
                'text-sm py-1 transition': true
              }"
              @click="handleCameraViewChange(view.name.toLocaleLowerCase() as CanonicalView)"
            >
              {{ view.name }}
            </button>
          </MenuItem>
          <MenuItem v-for="view in views" :key="view.name" v-slot="{ active }" as="template">
            <button
              :class="{
                'bg-primary text-foreground-on-primary': active,
                'text-foreground': !active,
                'text-sm py-2 transition': true
              }"
              @click="handleCameraViewChange(view)"
            >
              {{ view.view.name ?? view.name }}
            </button>
          </MenuItem>
        </MenuItems>
      </Transition>
    </Menu>
    <!-- Speckle Custom Views -->
    <Menu v-if="visualStore.speckleViews.length" as="div" class="relative z-40">
      <MenuButton v-slot="{ open }" as="template">
        <ButtonToggle flat secondary :active="open">
          <ViewsIcon class="h-5 w-5" />
        </ButtonToggle>
      </MenuButton>
      <Transition
        enter-active-class="transform ease-out duration-300 transition"
        enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
        enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
        leave-active-class="transition ease-in duration-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <MenuItems
          class="absolute w-24 left-2 mb-8 bottom-2 bg-foundation max-h-64 simple-scrollbar overflow-y-auto outline outline-2 outline-primary-muted rounded-lg shadow-lg overflow-hidden flex flex-col"
        >
          <MenuItem
            v-for="view in visualStore.speckleViews"
            :key="view.id"
            v-slot="{ active }"
            as="template"
          >
            <button
              :class="{
                'bg-primary text-foreground-on-primary': active,
                'text-foreground': !active,
                'text-sm py-2 transition': true
              }"
              @click="handleCameraViewChange(view)"
            >
              {{ view.name }}
            </button>
          </MenuItem>
        </MenuItems>
      </Transition>
    </Menu>
    <Menu as="div" class="relative z-30">
      <MenuButton v-slot="{ open }" as="template">
        <ButtonToggle flat secondary :active="open">
          <ViewModesIcon class="h-5 w-5" />
        </ButtonToggle>
      </MenuButton>
      <Transition
        enter-active-class="transform ease-out duration-300 transition"
        enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
        enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
        leave-active-class="transition ease-in duration-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <MenuItems
          class="absolute w-20 left-2 mb-8 bottom-2 bg-foundation max-h-64 simple-scrollbar overflow-y-auto outline outline-2 outline-primary-muted rounded-lg shadow-lg overflow-hidden flex flex-col"
        >
          <MenuItem
            v-for="(label, mode) in viewModes"
            :key="mode"
            v-slot="{ active }"
            as="template"
          >
            <button
              :class="{
                'bg-primary text-foreground-on-primary': active,
                'text-foreground': !active,
                'text-sm py-1 transition': true
              }"
              @click="handleCameraViewModeChange(Number(mode))"
            >
              {{ label }}
            </button>
          </MenuItem>
        </MenuItems>
      </Transition>
    </Menu>
    <!-- 
    <ButtonToggle
      flat
      secondary
      :active="sectionBox"
      @click="$emit('update:sectionBox', !sectionBox)"
    >
      <CubeIcon class="h-5 w-5" />
    </ButtonToggle>
    <ButtonSimple flat secondary @click="onClearPalletteClicked">
      <PaintBrushIcon class="h-5 w-5" />
    </ButtonSimple> -->
  </ButtonGroup>
</template>

<script setup lang="ts">
import {
  VideoCameraIcon,
  CubeIcon,
  ArrowsPointingOutIcon,
  PaintBrushIcon
} from '@heroicons/vue/24/solid'
import ViewModesIcon from 'src/components/icons/ViewModesIcon.vue'
import ViewsIcon from 'src/components/icons/ViewsIcon.vue'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/vue'
import { CanonicalView, SpeckleView, ViewMode } from '@speckle/viewer'
import ButtonToggle from 'src/components/controls/ButtonToggle.vue'
import ButtonGroup from 'src/components/controls/ButtonGroup.vue'
import ButtonSimple from 'src/components/controls/ButtonSimple.vue'
import { inject, watch } from 'vue'
import { resetPalette } from 'src/utils/matrixViewUtils'
import { useVisualStore } from '@src/store/visualStore'

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
</script>
