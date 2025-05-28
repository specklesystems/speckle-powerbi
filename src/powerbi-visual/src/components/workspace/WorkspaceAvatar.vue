<template>
  <div class="flex shrink-0 overflow-hidden rounded-md border border-outline-2 bg-foundation-2">
    <div
      class="h-full w-full bg-cover bg-center bg-no-repeat flex items-center justify-center"
      :style="logo ? { backgroundImage: `url('${logo}')` } : {}"
    >
      <span v-if="!logo" class="text-foreground-3 uppercase leading-none">
        {{ name[0] }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  logo: string | undefined | null
  name: string
}>()
</script>
