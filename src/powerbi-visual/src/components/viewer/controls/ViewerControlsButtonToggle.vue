<template>
  <button
    v-tippy="{ content: tooltip ?? '', placement: 'top', onShow: () => !!tooltip }"
    type="button"
    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    :class="
      active
        ? 'bg-primary/10 text-primary hover:bg-primary/15'
        : 'bg-highlight-1 text-foreground hover:bg-outline-2/75'
    "
  >
    <slot></slot>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  active?: boolean
  tooltip?: string
}>()
</script>
