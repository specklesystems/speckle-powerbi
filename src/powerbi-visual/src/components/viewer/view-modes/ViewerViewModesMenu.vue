<!-- eslint-disable vuejs-accessibility/no-static-element-interactions -->
<template>
  <div class="absolute left-10 sm:left-[46px] -top-0 bg-foundation rounded-md border border-outline-2 shadow min-w-[180px] z-30">
    <!-- Header -->
    <div class="px-2 py-1.5 border-b border-outline-2">
      <span class="text-body-2xs font-medium text-foreground">View modes</span>
    </div>

    <!-- View Mode List -->
    <div class="py-0.5">
      <button
        v-for="item in viewModes"
        :key="item.mode"
        class="w-full px-2 py-1 flex items-center hover:bg-highlight-1 text-left"
        @click="handleViewModeChange(item.mode)"
      >
        <div class="flex items-center gap-1.5">
          <CheckIcon
            v-if="isActiveMode(item.mode)"
            class="w-3.5 h-3.5 text-foreground"
          />
          <span v-else class="w-3.5 h-3.5" />
          <span class="text-body-2xs" :class="isActiveMode(item.mode) ? 'text-foreground font-medium' : 'text-foreground-2'">
            {{ item.label }}
          </span>
        </div>
      </button>
    </div>

    <!-- Edges Section -->
    <div class="border-t border-outline-2 px-2 py-1.5 space-y-2">
      <!-- Edges Toggle -->
      <div class="flex items-center justify-between">
        <span class="text-body-2xs text-foreground">Edges</span>
        <FormSwitch
          v-model="edgesEnabledLocal"
          :show-label="false"
          name="toggle-edges"
          :disabled="currentViewMode === ViewMode.PEN"
        />
      </div>

      <!-- Weight Slider (only show when edges enabled) -->
      <div v-if="edgesEnabledLocal" class="py-1">
        <FormRange
          v-model="edgesWeightLocal"
          name="edge-weight"
          label="Weight"
          :min="0.5"
          :max="3"
          :step="0.1"
        />
      </div>

      <!-- Color Selector (only show when edges enabled) -->
      <div v-if="edgesEnabledLocal" class="flex items-center justify-between">
        <span class="text-body-2xs text-foreground-2">Color</span>
        <div class="flex items-center gap-1">
          <button
            v-for="(color, index) in edgesColorOptions"
            :key="color === 'auto' ? 'auto' : color"
            class="flex items-center justify-center size-4 rounded-full"
            :class="edgesColorLocal === color && 'ring-2 ring-primary ring-offset-1'"
            @click="handleEdgesColorChange(color)"
          >
            <span
              class="size-3 rounded-full cursor-pointer"
              :style="{
                background:
                  index === 0
                    ? 'linear-gradient(135deg, #1a1a1a 50%, #ffffff 50%)'
                    : `#${(color as number).toString(16).padStart(6, '0')}`
              }"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ViewMode } from '@speckle/viewer'
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useVisualStore } from '@src/store/visualStore'
import FormSwitch from '../../form/FormSwitch.vue'
import FormRange from '../../form/FormRange.vue'
import { CheckIcon } from '@heroicons/vue/24/solid'
import type { ViewModeOptions } from '@src/plugins/viewer'

// Array to maintain proper display order (matching Speckle frontend)
const viewModes = [
  { mode: ViewMode.DEFAULT, label: 'Rendered' },
  { mode: ViewMode.SHADED, label: 'Shaded' },
  { mode: ViewMode.ARCTIC, label: 'Arctic' },
  { mode: ViewMode.SOLID, label: 'Solid' },
  { mode: ViewMode.PEN, label: 'Pen' }
]

const edgesColorOptions = [
  'auto' as const,
  0x3b82f6, // blue-500
  0x8b5cf6, // violet-500
  0x65a30d, // lime-600
  0xf97316, // orange-500
  0xf43f5e  // rose-500
]

const visualStore = useVisualStore()

// Emits
const emit = defineEmits<{
  (e: 'view-mode-clicked', value: ViewMode, options: ViewModeOptions): void
}>()

// Initialization flag
const isInitialized = ref(false)

// Local state synced with store (with safe defaults)
const edgesEnabledLocal = ref(visualStore.edgesEnabled ?? true)
const edgesWeightLocal = ref(visualStore.edgesWeight ?? 1)
const edgesColorLocal = ref<number | 'auto'>(visualStore.edgesColor ?? 'auto')

// Mark as initialized after next tick to prevent watchers firing on mount
onMounted(() => {
  nextTick(() => {
    isInitialized.value = true
  })
})

// Current view mode from store
const currentViewMode = computed(() => {
  return visualStore.defaultViewModeInFile
    ? Number(visualStore.defaultViewModeInFile) as ViewMode
    : ViewMode.DEFAULT
})

const isActiveMode = (mode: ViewMode) => mode === currentViewMode.value

// Compute the actual edge color to use (auto resolves to dark)
const finalEdgesColor = computed(() => {
  if (edgesColorLocal.value === 'auto') {
    return 0x1a1a1a // dark edges by default
  }
  return edgesColorLocal.value
})

// Build view mode options
const buildViewModeOptions = (mode: ViewMode): ViewModeOptions => {
  // PEN mode always has edges enabled and opacity 1
  const isPenMode = mode === ViewMode.PEN
  return {
    edges: isPenMode ? true : edgesEnabledLocal.value,
    outlineThickness: edgesWeightLocal.value,
    outlineOpacity: isPenMode ? 1 : 0.75,
    outlineColor: finalEdgesColor.value
  }
}

const handleViewModeChange = (mode: ViewMode) => {
  const options = buildViewModeOptions(mode)
  visualStore.setDefaultViewModeInFile(mode.toString())
  visualStore.writeViewModeToFile(mode)
  emit('view-mode-clicked', mode, options)
}

const handleEdgesColorChange = (color: number | 'auto') => {
  edgesColorLocal.value = color
}

// Apply edges changes to viewer when settings change
const applyEdgesSettings = () => {
  // Don't apply during initialization
  if (!isInitialized.value) return

  // Update store
  visualStore.setEdgesEnabled(edgesEnabledLocal.value)
  visualStore.setEdgesWeight(edgesWeightLocal.value)
  visualStore.setEdgesColor(edgesColorLocal.value)
  visualStore.writeEdgesSettingsToFile()

  // Re-apply current view mode with new options
  const options = buildViewModeOptions(currentViewMode.value)
  emit('view-mode-clicked', currentViewMode.value, options)
}

// Watch for edges settings changes and apply them
watch([edgesEnabledLocal, edgesWeightLocal, edgesColorLocal], () => {
  applyEdgesSettings()
})

// Sync local state with store when store changes (e.g., from file load)
watch(() => visualStore.edgesEnabled, (val) => {
  edgesEnabledLocal.value = val
})

watch(() => visualStore.edgesWeight, (val) => {
  edgesWeightLocal.value = val
})

watch(() => visualStore.edgesColor, (val) => {
  edgesColorLocal.value = val
})
</script>
