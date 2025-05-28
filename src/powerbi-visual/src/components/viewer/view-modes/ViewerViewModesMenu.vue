<!-- eslint-disable vuejs-accessibility/no-static-element-interactions -->
<template>
  <ViewerMenu v-model:open="open" title="View modes">
    <template #trigger-icon>
      <ViewModes class="h-5 w-5" />
    </template>
    <template #title>View modes</template>
    <div
      class="p-1.5"
      @mouseenter="cancelCloseTimer"
      @mouseleave="isManuallyOpened ? undefined : startCloseTimer"
      @focusin="cancelCloseTimer"
      @focusout="isManuallyOpened ? undefined : startCloseTimer"
    >
      <div v-for="(label, mode) in viewModes" :key="mode">
        <ViewerMenuItem
          :label="label"
          :active="mode.toString() === visualStore.defaultViewModeInFile"
          @click="handleViewModeChange(Number(mode))"
        />
      </div>
    </div>
  </ViewerMenu>
</template>

<script setup lang="ts">
import { useTimeoutFn } from '@vueuse/core'
import { ViewMode } from '@speckle/viewer'
import ViewerMenu from '../menu/ViewerMenu.vue'
import ViewerMenuItem from '../menu/ViewerMenuItem.vue'
import { onUnmounted, ref, computed, onMounted } from 'vue'
import { useVisualStore } from '@src/store/visualStore'
import ViewModes from '../../global/icon/ViewModes.vue'

const viewModes = {
  [ViewMode.DEFAULT]: 'Default',
  [ViewMode.DEFAULT_EDGES]: 'Edges',
  [ViewMode.SHADED]: 'Shaded',
  [ViewMode.PEN]: 'Pen',
  [ViewMode.ARCTIC]: 'Arctic',
  [ViewMode.COLORS]: 'Colors'
}

const visualStore = useVisualStore()

// Props
const props = defineProps<{
  open: boolean
}>()

// Emits
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'force-close-others'): void
  (e: 'view-mode-clicked', value: ViewMode): void
}>()

// Computed v-model
const open = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val)
})

// State
const isManuallyOpened = ref(false)

const { start: startCloseTimer, stop: cancelCloseTimer } = useTimeoutFn(
  () => {
    open.value = false
  },
  3000,
  { immediate: false }
)

const handleViewModeChange = (mode: ViewMode) => {
  open.value = false
  visualStore.setDefaultViewModeInFile(mode.toString())
  visualStore.writeViewModeToFile(mode)
  emit('view-mode-clicked', mode)
}

onUnmounted(() => {
  cancelCloseTimer()
})
</script>
