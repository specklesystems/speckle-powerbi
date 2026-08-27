<template>
  <div ref="menuWrapper" class="relative z-30">
    <ViewerControlsButtonToggle :tooltip="tooltip" :active="open" @click="toggleMenu">
      <slot name="trigger-icon" />
    </ViewerControlsButtonToggle>
    <div
      v-if="open"
      ref="menuContent"
      class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-foundation rounded-lg border border-outline-2 flex flex-col overflow-hidden shadow-sm"
    >
      <div
        v-if="$slots.title"
        class="flex items-center py-2 px-2 border-b border-outline-2 sticky top-0 z-50 bg-foundation"
      >
        <div class="flex items-center text-body-2xs text-foreground font-medium">
          <span class="truncate flex-1">
            <slot name="title"></slot>
          </span>
        </div>
      </div>
      <div class="max-h-64 overflow-y-auto">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { computed, ref } from 'vue'
import ViewerControlsButtonToggle from '../controls/ViewerControlsButtonToggle.vue'

const props = defineProps<{
  tooltip?: string
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const open = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val)
})

const menuContent = ref<HTMLElement | null>(null)
const menuWrapper = ref<HTMLElement | null>(null)

const toggleMenu = () => {
  open.value = !open.value
}

onClickOutside(
  menuContent,
  (event) => {
    if (!menuWrapper.value?.contains(event.target as Node)) {
      open.value = false
    }
  },
  { ignore: [menuWrapper] }
)
</script>
