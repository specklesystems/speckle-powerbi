<template>
  <button
    class="flex items-center justify-center rounded text-foreground-2"
    :class="[
      isActive
        ? 'shadow-md bg-foundation !text-foreground [&_*]:!text-foreground'
        : 'hover:bg-highlight-2 hover:!text-foreground-3 hover:[&_*]:!text-foreground-3'
    ]"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
defineProps<{
  isActive?: boolean
}>()
</script>
