<template>
  <div
    id="speckle-home-view"
    class="flex h-full w-full cursor-default items-center justify-center overflow-auto bg-zinc-50 p-6 font-inter"
  >
    <div class="flex w-full max-w-[392px] flex-col gap-4">
      <div class="flex items-center justify-between">
        <img src="@assets/logo-full.svg" alt="Speckle" class="block h-[23px] w-24" />
        <span class="text-[11px] leading-[1.2] text-zinc-400">v{{ version }}</span>
      </div>

      <div class="text-[15px] font-semibold leading-[1.2] text-zinc-900">
        Add <span class="text-blue-600">Model Info</span> and
        <span class="text-blue-600">Application IDs</span> to load your model
      </div>

      <div class="flex flex-col overflow-hidden rounded border border-zinc-200 bg-white">
        <div
          v-for="(field, index) in fields"
          :key="field.name"
          class="flex items-center gap-2.5 px-3 py-[9px]"
          :class="{ 'border-b border-zinc-100': index < fields.length - 1 }"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-3.5 w-3.5 shrink-0"
            :class="field.required ? 'text-blue-600' : 'text-zinc-400'"
          >
            <path v-for="d in field.icon" :key="d" :d="d" />
          </svg>
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
// ones are read by position; icons are inlined Lucide paths (24px grid)
// because the PBI sandbox blocks external assets
const fields = [
  {
    name: 'Model Info',
    hint: 'Required',
    required: true,
    icon: [
      'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
      'm3.3 7 8.7 5 8.7-5',
      'M12 22V12'
    ]
  },
  {
    name: 'Application IDs',
    hint: 'Required',
    required: true,
    icon: [
      'M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z'
    ]
  },
  {
    name: 'Object Data',
    hint: 'tooltips on hover',
    required: false,
    icon: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z', 'M12 16v-4', 'M12 8h.01']
  },
  {
    name: 'Color By',
    hint: 'colouring by a column',
    required: false,
    icon: [
      'M13.5 6.5h.01',
      'M17.5 10.5h.01',
      'M8.5 7.5h.01',
      'M6.5 12.5h.01',
      'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z'
    ]
  }
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
