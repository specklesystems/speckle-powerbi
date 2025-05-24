<!-- eslint-disable vuejs-accessibility/no-static-element-interactions -->
<template>
  <ViewerMenu v-model:open="open" tooltip="Views">
    <template #trigger-icon>
      <Views class="w-5 h-5" />
    </template>
    <template #title>Views</template>
    <div
      class="max-h-64 simple-scrollbar overflow-y-auto flex flex-col p-1.5"
      @mouseenter="cancelCloseTimer"
      @mouseleave="isManuallyOpened ? undefined : startCloseTimer"
      @focusin="cancelCloseTimer"
      @focusout="isManuallyOpened ? undefined : startCloseTimer"
    >
      <div v-for="shortcut in viewShortcuts" :key="shortcut.name">
        <ViewerMenuItem
          :label="shortcut.name"
          hide-active-tick
          :active="activeView === shortcut.name.toLowerCase()"
          @click="handleViewChange(shortcut.name.toLowerCase() as CanonicalView)"
        />
      </div>

      <div v-if="views.length !== 0" class="w-full border-b my-1"></div>

      <ViewerMenuItem
        v-for="view in views"
        :key="view.id"
        hide-active-tick
        :active="activeView === view.id"
        :label="view.name ? view.name : view.id"
        @click="handleViewChange(view)"
      />
    </div>
  </ViewerMenu>
</template>

<script setup lang="ts">
import { useTimeoutFn } from '@vueuse/core'
import type { CanonicalView, SpeckleView } from '@speckle/viewer'
import { onUnmounted, ref, computed } from 'vue'
import ViewerMenu from '../menu/ViewerMenu.vue'
import ViewerMenuItem from '../menu/ViewerMenuItem.vue'
import Views from '../../global/icon/Views.vue'
import { ViewShortcuts } from '../../../helpers/viewer/shortcuts/shortcuts'

// Props
const props = defineProps<{
  views: SpeckleView[]
  open: boolean
}>()

// Emits
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'force-close-others'): void
  (e: 'view-clicked', value: CanonicalView | SpeckleView)
}>()

// Computed open for v-model
const open = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val)
})

// State
const isManuallyOpened = ref(false)
const activeView = ref<string | null>(null)

const { start: startCloseTimer, stop: cancelCloseTimer } = useTimeoutFn(
  () => {
    open.value = false
  },
  3000,
  { immediate: false }
)

const handleViewChange = (v: CanonicalView | SpeckleView) => {
  open.value = false
  emit('view-clicked', v)
}

const viewShortcuts = Object.values(ViewShortcuts)

onUnmounted(() => {
  cancelCloseTimer()
})
</script>
