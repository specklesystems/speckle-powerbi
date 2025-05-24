<template>
  <button
    :v-tippy="description ? description : undefined"
    class="flex items-center justify-between hover:bg-highlight-1 text-foreground w-full h-full text-body-2xs py-1.5 pr-2 pl-1 rounded-md"
    :class="{ 'bg-highlight-1': active }"
  >
    <div v-if="!hideActiveTick" class="w-5">
      <Check v-if="active" class="h-4 w-4 text-foreground-2" />
    </div>
    <div class="flex-1 text-left">{{ label }}</div>
    <slot />
  </button>
</template>

<script setup lang="ts">
import Check from '../../global/icon/Check.vue'
defineProps<{
  label: string
  description?: string
  active?: boolean
  hideActiveTick?: boolean
  shortcut?: string
}>()
</script>
