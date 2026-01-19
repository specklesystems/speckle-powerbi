<template>
  <div class="w-full flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <label
        :for="name"
        class="block text-body-2xs text-foreground-2"
      >
        {{ label || name }}
      </label>
      <span class="text-body-2xs text-foreground-2">{{ displayValue }}</span>
    </div>

    <input
      :id="name"
      :name="name"
      type="range"
      :min="min"
      :max="max"
      :step="step"
      :value="currentValue"
      :disabled="disabled"
      class="w-full h-1.5 outline-none slider"
      :class="{
        'disabled:opacity-50 disabled:cursor-not-allowed': disabled
      }"
      :aria-label="label"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="currentValue"
      @input="handleInput"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const props = defineProps<{
  min: number
  max: number
  step: number
  name: string
  label: string
  disabled?: boolean
  modelValue?: number
}>()

const emit = defineEmits(['update:modelValue'])

const currentValue = ref(props.modelValue ?? props.min)

// Watch for external changes to modelValue
watch(() => props.modelValue, (newVal) => {
  if (newVal !== undefined && newVal !== currentValue.value) {
    currentValue.value = newVal
  }
})

const displayValue = computed(() => {
  // Round to avoid floating point issues
  return Math.round(currentValue.value * 10) / 10
})

const clampValue = (value: number): number => {
  return Math.max(props.min, Math.min(props.max, value))
}

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  const value = Number(target.value)
  const clampedValue = clampValue(value)
  currentValue.value = clampedValue
  emit('update:modelValue', clampedValue)
}
</script>

<style scoped>
.slider {
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
}

.slider::-webkit-slider-runnable-track {
  @apply h-1.5 rounded-full bg-outline-3;
}

.slider::-moz-range-track {
  @apply h-1.5 rounded-full bg-outline-3;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  @apply h-2.5 w-2.5 rounded-full cursor-pointer bg-foreground-2;
  margin-top: -2px;
}

.slider::-moz-range-thumb {
  -webkit-appearance: none;
  appearance: none;
  @apply h-2.5 w-2.5 rounded-full cursor-pointer border-0 bg-foreground-2;
}
</style>
