<template>
  <ViewerMenu v-model:open="open" tooltip="Context Mode">
    <template #trigger-icon>
      <Context class="h-5 w-5" />
    </template>
    <template #title>Context Mode</template>
    <div class="p-1 space-y-2">
      <div v-for="model in modelMetadata" :key="model.rootObjectId" class="pb-2 border-b border-outline-2 last:border-0">
        <div class="flex items-center gap-1">
          <div class="text-xs font-medium text-foreground truncate max-w-[80px]">{{ model.modelName }}</div>
          <!-- Visibility toggle -->
          <button
            class="p-1 rounded transition flex items-center justify-center"
            :class="
              getSettings(model.rootObjectId).visible
                ? 'bg-primary text-white'
                : 'bg-foundation-2 text-foreground hover:bg-highlight-1'
            "
            @click="toggleVisibility(model.rootObjectId)"
          >
            <EyeIcon v-if="getSettings(model.rootObjectId).visible" class="h-4 w-4" />
            <EyeSlashIcon v-else class="h-4 w-4" />
          </button>

          <!-- Lock toggle -->
          <button
            class="p-1 rounded transition flex items-center justify-center"
            :class="
              getSettings(model.rootObjectId).locked
                ? 'bg-foundation-2 text-foreground hover:bg-highlight-1'
                : 'bg-primary text-white'
            "
            :disabled="!getSettings(model.rootObjectId).visible"
            @click="toggleLock(model.rootObjectId)"
          >
            <LockClosedIcon v-if="getSettings(model.rootObjectId).locked" class="h-4 w-4" />
            <LockOpenIcon v-else class="h-4 w-4" />
          </button>

          <!-- Interactive toggle -->
          <button
            class="p-1 rounded transition flex items-center justify-center"
            :class="
              getSettings(model.rootObjectId).interactive
                ? 'bg-primary text-white'
                : 'bg-foundation-2 text-foreground hover:bg-highlight-1'
            "
            :disabled="!getSettings(model.rootObjectId).visible"
            :title="getSettings(model.rootObjectId).interactive ? 'Interactive (participates in cross-filtering)' : 'Non-interactive (no cross-filtering)'"
            @click="toggleInteractive(model.rootObjectId)"
          >
            <LinkIcon v-if="getSettings(model.rootObjectId).interactive" class="h-4 w-4" />
            <LinkSlashIcon v-else class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </ViewerMenu>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useVisualStore } from '@src/store/visualStore'
import ViewerMenu from '../menu/ViewerMenu.vue'
import Context from '../../global/icon/Context.vue'
import { LockClosedIcon, LockOpenIcon, EyeIcon, EyeSlashIcon, LinkIcon, LinkSlashIcon } from '@heroicons/vue/24/outline'

const visualStore = useVisualStore()

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const open = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val)
})

const modelMetadata = computed(() => visualStore.modelMetadata)

const getSettings = (rootObjectId: string) => {
  return visualStore.getModelContextSettings(rootObjectId)
}

const toggleVisibility = (rootObjectId: string) => {
  const current = getSettings(rootObjectId)
  const newVisible = !current.visible

  // hidden models get non-interactive automatically
  // ux would be very confusing otherwise
  const newSettings = {
    ...current,
    visible: newVisible,
    interactive: newVisible ? current.interactive : false
  }

  visualStore.setModelContextMode(rootObjectId, newSettings)
  visualStore.viewerEmit('applyContextMode', rootObjectId, newSettings)
  visualStore.writeContextModeToFile()
}

const toggleLock = (rootObjectId: string) => {
  const current = getSettings(rootObjectId)
  const newSettings = { ...current, locked: !current.locked }

  visualStore.setModelContextMode(rootObjectId, newSettings)
  visualStore.viewerEmit('applyContextMode', rootObjectId, newSettings)
  visualStore.writeContextModeToFile()
}

const toggleInteractive = (rootObjectId: string) => {
  const current = getSettings(rootObjectId)
  const newSettings = { ...current, interactive: !current.interactive }

  visualStore.setModelContextMode(rootObjectId, newSettings)
  visualStore.viewerEmit('applyContextMode', rootObjectId, newSettings)
  visualStore.writeContextModeToFile()

  // need to rebuild selection registrations
  visualStore.setPostClickSkipNeeded(false)

  // need to refresh host data for selection registration
  visualStore.host.refreshHostData()
}
</script>
