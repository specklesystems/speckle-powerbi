<template>
  <div class="flex items-center space-x-2">
    <button
      :id="name"
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :disabled="disabled"
      class="relative inline-flex flex-shrink-0 h-[18px] w-[30px] rounded-full transition-colors ease-in-out duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
      :class="modelValue ? 'bg-primary' : 'bg-foreground-3'"
      @click="toggle"
    >
      <span
        class="pointer-events-none inline-block h-3 w-3 rounded-full mt-[3px] ml-[3px] ring-0 transition ease-in-out duration-200 bg-foreground-on-primary"
        :class="modelValue ? 'translate-x-[12px]' : 'translate-x-0'"
      />
    </button>
    <label v-if="showLabel" :for="name" class="block label-light">
      <span>{{ label || name }}</span>
    </label>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    showLabel?: boolean
    name: string
    label?: string
    disabled?: boolean
  }>(),
  {
    showLabel: true,
    modelValue: false
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const toggle = () => {
  if (!props.disabled) {
    emit('update:modelValue', !props.modelValue)
  }
}
</script>
