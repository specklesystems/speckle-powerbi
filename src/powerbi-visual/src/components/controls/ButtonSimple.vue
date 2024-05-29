<template>
  <button
    ref="button"
    :class="`transition rounded-lg w-10 h-10 flex items-center justify-center ${shadowClasses} ${colorClasses} active:scale-[0.9] outline-none`"
  >
    <slot></slot>
  </button>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

let active = ref(false)
let button = ref<HTMLElement>()

const props = defineProps<{
  flat?: boolean
  secondary?: boolean
}>()

const shadowClasses = computed(() => (props.flat ? '' : 'shadow-md'))

const colorClasses = computed(() => {
  const parts = []
  if (active.value) {
    if (props.secondary) parts.push('bg-foundation text-primary')
    else parts.push('bg-primary text-foreground-on-primary')
  } else {
    parts.push('bg-foundation text-foreground')
  }
  return parts.join(' ')
})

const onPointerDown = () => (active.value = true)
const onPointerUp = () => (active.value = false)

onMounted(() => {
  button.value.addEventListener('pointerdown', onPointerDown)
  button.value.addEventListener('pointerup', onPointerUp)
})

onBeforeUnmount(() => {
  button.value.removeEventListener('pointerdown', onPointerDown)
  button.value.removeEventListener('pointerup', onPointerUp)
})
</script>
