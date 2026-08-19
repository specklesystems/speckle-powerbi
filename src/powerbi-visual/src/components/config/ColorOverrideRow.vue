<template>
  <div class="flex h-10 items-center gap-2 px-3">
    <div class="flex min-w-0 flex-1 flex-col">
      <span
        class="truncate text-xs font-medium leading-[1.2] text-zinc-900"
        :title="label"
      >
        {{ label }}
      </span>
      <span v-if="sublabel" class="truncate text-[10px] leading-[1.2] text-zinc-400">
        {{ sublabel }}
      </span>
    </div>

    <span
      v-if="showInvalid"
      :id="`${controlId}-error`"
      class="shrink-0 text-[10px] font-medium text-red-600"
      role="alert"
    >
      Invalid hex
    </span>

    <input
      :id="`${controlId}-hex`"
      v-model="hexText"
      type="text"
      spellcheck="false"
      autocomplete="off"
      maxlength="7"
      class="w-[72px] shrink-0 rounded border bg-white px-1.5 py-0.5 font-mono text-[11px] leading-[1.4] text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :class="showInvalid ? 'border-red-400' : 'border-zinc-200'"
      :aria-label="`Hex color for ${label}`"
      :aria-invalid="showInvalid"
      :aria-describedby="showInvalid ? `${controlId}-error` : undefined"
      @keydown.enter.prevent="commitHex"
      @blur="onHexBlur"
    />

    <!-- the native color input IS the swatch: click/Enter opens the picker;
         @input previews locally, @change is the persistence commit point -->
    <input
      :id="`${controlId}-swatch`"
      type="color"
      class="h-6 w-6 shrink-0 cursor-pointer rounded border border-zinc-200 bg-white p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :value="pickerValue"
      :aria-label="`Pick color for ${label} (current ${displayColor})`"
      @input="onPickerInput"
      @change="onPickerChange"
    />

    <button
      v-if="overridden"
      type="button"
      class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :aria-label="`Reset color for ${label} to automatic`"
      title="Reset to automatic color"
      @click="emit('reset')"
    >
      <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" aria-hidden="true">
        <path
          d="M3 8a5 5 0 1 1 1.5 3.6M3 8V4.5M3 8h3.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <!-- alignment placeholder when there is nothing to reset -->
    <span v-else class="h-6 w-6 shrink-0" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { normalizeHex } from '@src/utils/colorOverrides'

const props = defineProps<{
  /** stable identity, used for control ids */
  valueKey: string
  label: string
  sublabel?: string
  /** '#RRGGBB' — override if set, otherwise the automatic palette color */
  effectiveColor: string
  overridden: boolean
}>()

const emit = defineEmits<{
  /** the user committed a valid opaque color (picker close or hex Enter/blur) */
  (e: 'commit', color: string): void
  (e: 'reset'): void
}>()

// Uncommitted picker drag preview — swatch and hex follow live, nothing persists.
const draftColor = ref<string | null>(null)
const hexText = ref(props.effectiveColor)
const showInvalid = ref(false)

const displayColor = computed(() => draftColor.value ?? props.effectiveColor)
// native color inputs want lowercase #rrggbb
const pickerValue = computed(() => displayColor.value.toLowerCase())

const controlId = computed(
  () => `color-override-${props.valueKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`
)

// External change (commit landed, reset, theme change): drop local drafts.
watch(
  () => props.effectiveColor,
  (color) => {
    draftColor.value = null
    hexText.value = color
    showInvalid.value = false
  }
)

const commitColor = (color: string) => {
  draftColor.value = null
  showInvalid.value = false
  if (color !== props.effectiveColor) emit('commit', color)
  hexText.value = color
}

const commitHex = () => {
  const normalized = normalizeHex(hexText.value)
  if (!normalized) {
    // keep the last valid effective color, persist nothing
    showInvalid.value = true
    return
  }
  commitColor(normalized)
}

const onHexBlur = () => {
  if (normalizeHex(hexText.value)) {
    commitHex()
  } else {
    // leaving the field with invalid input: restore the effective color so the
    // UI never claims a color that was not applied
    hexText.value = displayColor.value
    showInvalid.value = false
  }
}

const onPickerInput = (event: Event) => {
  const normalized = normalizeHex((event.target as HTMLInputElement).value)
  if (!normalized) return
  draftColor.value = normalized
  hexText.value = normalized
  showInvalid.value = false
}

const onPickerChange = (event: Event) => {
  const normalized = normalizeHex((event.target as HTMLInputElement).value)
  if (normalized) commitColor(normalized)
}
</script>
