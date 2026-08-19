<template>
  <div
    id="speckle-home-view"
    class="flex h-full w-full cursor-default items-center justify-center overflow-auto bg-zinc-50 p-6"
  >
    <div class="flex w-full max-w-[392px] flex-col gap-4">
      <div class="flex items-center justify-between">
        <img src="@assets/logo-full.svg" alt="Speckle" class="block h-[23px] w-24" />
        <span class="text-[11px] leading-[1.2] text-zinc-400">v{{ version }}</span>
      </div>

      <div class="text-[15px] font-semibold leading-[1.2] text-zinc-900">
        Add <span class="text-blue-600">Model Info</span> to load your model
      </div>

      <div class="flex flex-col overflow-hidden rounded border border-zinc-200 bg-white">
        <div
          v-for="(field, index) in fields"
          :key="field.name"
          class="flex items-center gap-2.5 px-3 py-[9px]"
          :class="{ 'border-b border-zinc-100': index < fields.length - 1 }"
        >
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="field.required ? 'bg-blue-600' : 'bg-zinc-200'"
          ></span>
          <span
            class="flex-1 text-xs leading-[1.2]"
            :class="field.required ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-700'"
          >
            {{ field.name }}
          </span>
          <span
            class="text-[11px] leading-[1.2]"
            :class="field.required ? 'font-medium text-blue-600' : 'text-zinc-400'"
          >
            {{ field.hint }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-3.5">
        <button :class="linkClass" @click="goToGuide">Getting started</button>
        <button :class="linkClass" @click="goToForum">Help</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useVisualStore } from '../store/visualStore'

const visualStore = useVisualStore()

const version = __VISUAL_VERSION__

// same order as the field wells in the Fields pane, so the required
// one is read by position
const fields = [
  { name: 'Model Info', hint: 'Required', required: true },
  { name: 'Application IDs', hint: 'selection and cross-filtering', required: false },
  { name: 'Object Data', hint: 'tooltips on hover', required: false },
  { name: 'Color By', hint: 'colouring by a column', required: false }
]

const linkClass = `border-b border-zinc-200 pb-px text-xs font-medium leading-[1.2] text-zinc-500
  transition-colors hover:border-zinc-400 hover:text-zinc-900`

function goToForum() {
  visualStore.host.launchUrl('https://speckle.community/tag/powerbi')
}

function goToGuide() {
  visualStore.host.launchUrl('https://speckle.guide/user/powerbi')
}
</script>

<style>
/* Inter is bundled base64-inline (no network fetch — the PBI sandbox blocks
   webfont requests, which is why the global stack stays Segoe UI). Variable
   font, latin subset, weights 400-600 — exactly what this view uses. */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400 600;
  src: url('../../assets/inter-latin-400-600.woff2') format('woff2');
}

#speckle-home-view {
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
