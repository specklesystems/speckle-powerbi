<template>
  <div class="flex flex-col overflow-hidden rounded border border-zinc-200 bg-white">
    <!-- header: same anatomy as the Dev mode row -->
    <div class="flex items-center gap-2.5 px-3 py-[9px]">
      <div class="flex flex-1 flex-col gap-0.5">
        <span class="text-xs font-medium leading-[1.2] text-zinc-900">Color overrides</span>
        <span class="text-[11px] leading-[1.2] text-zinc-400">
          Assign fixed colors to individual Color by categories.
        </span>
      </div>
      <button
        v-if="state === 'editor'"
        type="button"
        class="shrink-0 cursor-pointer rounded border border-zinc-200 px-2 py-1 text-[11px] font-medium leading-[1.2] text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="overrideTotal === 0"
        @click="confirmOpen = true"
      >
        Reset all
      </button>
    </div>

    <!-- persistence failures are inline and never silently drop mappings -->
    <div
      v-if="visualStore.colorOverridesError"
      class="border-t border-zinc-200 bg-red-50 px-3 py-2 text-[11px] leading-[1.3] text-red-700"
      role="alert"
    >
      {{ visualStore.colorOverridesError }}
    </div>

    <div v-if="state === 'noField'" class="border-t border-zinc-200 px-3 py-3 text-[11px] leading-[1.4] text-zinc-500">
      Add a categorical field to Color by to customize its colors.
    </div>

    <div v-else-if="state === 'error'" class="border-t border-zinc-200 px-3 py-3 text-[11px] leading-[1.4] text-red-600" role="alert">
      Category data could not be loaded. Fix the data error to edit color overrides.
    </div>

    <div v-else-if="state === 'loading'" class="flex items-center gap-2 border-t border-zinc-200 px-3 py-3 text-[11px] leading-[1.4] text-zinc-500" aria-busy="true">
      <span class="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-500" aria-hidden="true" />
      Loading categories…
    </div>

    <div v-else-if="state === 'empty'" class="border-t border-zinc-200 px-3 py-3 text-[11px] leading-[1.4] text-zinc-500">
      {{ fieldDisplayName }} has no categories in the current data.
    </div>

    <template v-else>
      <!-- search + All/Overridden filter -->
      <div class="flex items-center gap-2 border-t border-zinc-200 px-3 py-2">
        <input
          v-model="search"
          type="search"
          class="min-w-0 flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] leading-[1.4] text-zinc-700 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          :placeholder="`Search ${fieldDisplayName} categories`"
          :aria-label="`Search ${fieldDisplayName} categories`"
        />
        <div class="flex shrink-0 rounded border border-zinc-200" role="group" aria-label="Filter categories">
          <button
            v-for="mode in filterModes"
            :key="mode.key"
            type="button"
            class="cursor-pointer px-2 py-1 text-[11px] font-medium leading-[1.2] first:rounded-l last:rounded-r focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            :class="
              filterMode === mode.key
                ? 'bg-zinc-100 text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-700'
            "
            :aria-pressed="filterMode === mode.key"
            @click="filterMode = mode.key"
          >
            {{ mode.label }}
          </button>
        </div>
      </div>

      <div
        v-if="filteredRows.length === 0"
        class="border-t border-zinc-200 px-3 py-3 text-[11px] leading-[1.4] text-zinc-500"
      >
        No categories match.
      </div>

      <!-- virtualized category list (target: 10,000 categories, 1,000 overrides) -->
      <div
        v-else
        v-bind="containerProps"
        class="border-t border-zinc-200"
        :style="{ maxHeight: listMaxHeight + 'px', overflowY: 'auto' }"
      >
        <div v-bind="wrapperProps">
          <template v-for="item in list" :key="rowKey(item.data)">
            <div
              v-if="item.data.kind === 'header'"
              class="flex h-10 items-end px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
              role="heading"
              aria-level="3"
            >
              {{ item.data.label }}
            </div>
            <ColorOverrideRow
              v-else
              :value-key="item.data.valueKey"
              :label="item.data.label"
              :sublabel="item.data.sublabel"
              :effective-color="item.data.effectiveColor"
              :overridden="item.data.overridden"
              @commit="(color) => onCommit(item.data, color)"
              @reset="onReset(item.data)"
            />
          </template>
        </div>
      </div>
    </template>

    <!-- Reset-all confirmation: Advanced Edit has no Save/Cancel transaction,
         so clearing a whole field's mappings needs an explicit confirm -->
    <div
      v-if="confirmOpen"
      class="fixed inset-0 z-[300] flex items-center justify-center bg-black/30 p-6"
      @keydown.esc.stop.prevent="confirmOpen = false"
      @keydown.tab.prevent="cycleDialogFocus"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        :aria-label="resetAllPrompt"
        class="flex w-full max-w-[320px] flex-col gap-3 rounded border border-zinc-200 bg-white p-4 shadow-lg"
      >
        <span class="text-xs font-medium leading-[1.4] text-zinc-900">{{ resetAllPrompt }}</span>
        <span class="text-[11px] leading-[1.4] text-zinc-500">
          All categories of this field return to automatic palette colors. Other fields keep
          their overrides.
        </span>
        <div class="flex justify-end gap-2">
          <button
            ref="cancelButton"
            type="button"
            class="cursor-pointer rounded border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            @click="confirmOpen = false"
          >
            Cancel
          </button>
          <button
            ref="confirmButton"
            type="button"
            class="cursor-pointer rounded bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-1"
            @click="onResetAll"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useVirtualList, useWindowSize } from '@vueuse/core'
import ColorOverrideRow from './ColorOverrideRow.vue'
import { useAdvancedEditScale } from '@src/composables/useAdvancedEditScale'
import { useVisualStore } from '@src/store/visualStore'
import {
  absentOverrides,
  overrideCount,
  valueKeyTypeTag
} from '@src/utils/colorOverrides'

type CardState = 'noField' | 'error' | 'loading' | 'empty' | 'editor'

interface Row {
  kind: 'present' | 'absent' | 'header'
  valueKey: string
  label: string
  sublabel?: string
  effectiveColor: string
  overridden: boolean
}

const visualStore = useVisualStore()

const field = computed(() => visualStore.dataInput?.colorByField ?? null)
const categories = computed(() => visualStore.dataInput?.colorByCategories ?? null)
const fieldDisplayName = computed(() => field.value?.displayName ?? 'Color by')
const fieldOverrides = computed(() =>
  field.value ? visualStore.colorOverrides.fields[field.value.queryName] : undefined
)
const overrideTotal = computed(() =>
  field.value ? overrideCount(visualStore.colorOverrides, field.value.queryName) : 0
)

const search = ref('')
const filterMode = ref<'all' | 'overridden'>('all')
const filterModes = [
  { key: 'all', label: 'All' },
  { key: 'overridden', label: 'Overridden' }
] as const

const absentRows = computed<Row[]>(() =>
  absentOverrides(categories.value ?? [], fieldOverrides.value).map(({ valueKey, entry }) => ({
    kind: 'absent',
    valueKey,
    label: entry.label,
    sublabel: `${valueKeyTypeTag(valueKey)} — not in current data`,
    effectiveColor: entry.color,
    overridden: true
  }))
)

const state = computed<CardState>(() => {
  if (!visualStore.fieldInputState.colorBy) return 'noField'
  if (visualStore.commonError) return 'error'
  if (!categories.value || !field.value) return 'loading'
  if (categories.value.length === 0 && absentRows.value.length === 0) return 'empty'
  return 'editor'
})

/** Present categories in Color-by/data order — never alphabetized. */
const presentRows = computed<Row[]>(() => {
  const list = categories.value ?? []
  // colliding display labels get disambiguating type/raw-value context
  const labelCounts = new Map<string, number>()
  for (const category of list) {
    labelCounts.set(category.label, (labelCounts.get(category.label) ?? 0) + 1)
  }
  const labelTypeCounts = new Map<string, number>()
  for (const category of list) {
    const key = `${category.label}|${valueKeyTypeTag(category.valueKey)}`
    labelTypeCounts.set(key, (labelTypeCounts.get(key) ?? 0) + 1)
  }
  return list.map((category) => {
    const override = fieldOverrides.value?.overrides[category.valueKey]
    let sublabel: string | undefined
    if ((labelCounts.get(category.label) ?? 0) > 1) {
      const tag = valueKeyTypeTag(category.valueKey)
      sublabel =
        (labelTypeCounts.get(`${category.label}|${tag}`) ?? 0) > 1 ? category.valueKey : tag
    }
    return {
      kind: 'present' as const,
      valueKey: category.valueKey,
      label: category.label,
      sublabel,
      effectiveColor: override?.color ?? category.autoColor,
      overridden: override !== undefined
    }
  })
})

const filteredRows = computed<Row[]>(() => {
  const query = search.value.trim().toLowerCase()
  const matches = (row: Row) => !query || row.label.toLowerCase().includes(query)
  const overriddenOnly = filterMode.value === 'overridden'
  const present = presentRows.value.filter(
    (row) => matches(row) && (!overriddenOnly || row.overridden)
  )
  const absent = absentRows.value.filter(matches)
  if (absent.length === 0) return present
  return [
    ...present,
    {
      kind: 'header' as const,
      valueKey: '__absent-header__',
      label: 'Not currently in data',
      effectiveColor: '',
      overridden: false
    },
    ...absent
  ]
})

const { list, containerProps, wrapperProps } = useVirtualList(filteredRows, {
  itemHeight: 40,
  overscan: 8
})

// Fill the available vertical real estate. The page sits under a CSS zoom, so
// vh units would overshoot (they resolve against the unzoomed viewport, then
// get scaled) — divide the real window height by the scale instead, and
// reserve room for the page padding, card/search headers and the Dev mode card.
const { height: windowHeight } = useWindowSize()
const uiScale = useAdvancedEditScale()
const RESERVED_CHROME = 250
const listMaxHeight = computed(() =>
  Math.max(280, Math.round(windowHeight.value / uiScale.value) - RESERVED_CHROME)
)

const rowKey = (row: Row) => `${row.kind}:${row.valueKey}`

const onCommit = (row: Row, color: string) => {
  if (!field.value) return
  visualStore.setColorOverride(
    field.value.queryName,
    field.value.displayName,
    row.valueKey,
    row.label,
    color
  )
}

const onReset = (row: Row) => {
  if (!field.value) return
  visualStore.resetColorOverride(field.value.queryName, row.valueKey)
}

// ── Reset all ────────────────────────────────────────────────────────────────

const confirmOpen = ref(false)
const cancelButton = ref<HTMLButtonElement>()
const confirmButton = ref<HTMLButtonElement>()

const resetAllPrompt = computed(
  () =>
    `Reset ${overrideTotal.value} color ${
      overrideTotal.value === 1 ? 'override' : 'overrides'
    } for ${fieldDisplayName.value}?`
)

watch(confirmOpen, (open) => {
  if (open) void nextTick(() => cancelButton.value?.focus())
})

/** Two-control focus trap for the confirmation dialog. */
const cycleDialogFocus = (event: KeyboardEvent) => {
  const target = event.shiftKey
    ? document.activeElement === cancelButton.value
      ? confirmButton.value
      : cancelButton.value
    : document.activeElement === confirmButton.value
      ? cancelButton.value
      : confirmButton.value
  target?.focus()
}

const onResetAll = () => {
  if (field.value) visualStore.resetAllColorOverrides(field.value.queryName)
  confirmOpen.value = false
}
</script>
