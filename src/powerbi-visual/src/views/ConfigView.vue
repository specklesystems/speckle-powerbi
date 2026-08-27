<template>
  <div
    id="speckle-config-view"
    class="absolute inset-0 z-[100] flex h-full w-full cursor-default overflow-auto bg-zinc-50 p-6"
    :style="{ zoom: uiScale }"
  >
    <!-- m-auto (not items-center on the scroller): centers when the content is
         short, keeps the top reachable when it scrolls -->
    <div class="m-auto flex w-full max-w-[392px] flex-col gap-4">
      <ColorOverridesCard />

      <!-- same row anatomy as the empty-state field list: text-xs label,
           text-[11px] hint, px-3 py-[9px] row inside a white bordered card -->
      <div class="flex flex-col overflow-hidden rounded border border-zinc-200 bg-white">
        <div class="flex items-center gap-2.5 px-3 py-[9px]">
          <div class="flex flex-1 flex-col gap-0.5">
            <label for="devMode" class="cursor-pointer text-xs font-medium leading-[1.2] text-zinc-900">
              Dev mode
            </label>
            <span class="text-[11px] leading-[1.2] text-zinc-400">
              Show Speckle diagnostics in the viewer.
            </span>
          </div>
          <FormSwitch
            name="devMode"
            :show-label="false"
            :model-value="visualStore.isDevMode"
            @update:model-value="visualStore.setDevMode"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import FormSwitch from '../components/form/FormSwitch.vue'
import ColorOverridesCard from '../components/config/ColorOverridesCard.vue'
import { useVisualStore } from '../store/visualStore'
import { useAdvancedEditScale } from '../composables/useAdvancedEditScale'

const visualStore = useVisualStore()

// Advanced Edit fills the editor surface 1:1 (no host page-zoom scaling like
// the report canvas gets) — scale the whole page with the surface size so it
// stays readable on large/high-DPI monitors.
const uiScale = useAdvancedEditScale()
</script>

<style>
/* Inter itself is @font-face'd once in HomeView (base64-inline, always in the
   bundle) — only the stack is repeated here. */
#speckle-config-view {
  font-family:
    'Inter',
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Helvetica,
    Arial,
    sans-serif;
}
</style>
