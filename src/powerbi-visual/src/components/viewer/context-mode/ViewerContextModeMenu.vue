<template>
  <ViewerMenu v-model:open="open" tooltip="Context Mode">
    <template #trigger-icon>
      <Context class="h-5 w-5" />
    </template>
    <template #title>Context Mode</template>
    <div class="p-1 space-y-2">
      <div v-for="model in modelMetadata" :key="model.modelId" class="pb-2 border-b border-outline-2 last:border-0">
        <div class="flex items-center gap-1">
          <div class="text-xs font-medium text-foreground truncate max-w-[80px]">{{ model.modelName }}</div>
          <!-- Visibility toggle -->
          <button
            class="p-1 rounded transition flex items-center justify-center"
            :class="
              getSettings(model.modelId).visible
                ? 'bg-primary text-white'
                : 'bg-foundation-2 text-foreground hover:bg-highlight-1'
            "
            @click="toggleVisibility(model.modelId)"
          >
            <EyeIcon v-if="getSettings(model.modelId).visible" class="h-4 w-4" />
            <EyeSlashIcon v-else class="h-4 w-4" />
          </button>

          <!-- Lock toggle -->
          <button
            class="p-1 rounded transition flex items-center justify-center"
            :class="
              getSettings(model.modelId).locked
                ? 'bg-foundation-2 text-foreground hover:bg-highlight-1'
                : 'bg-primary text-white'
            "
            :disabled="!getSettings(model.modelId).visible"
            @click="toggleLock(model.modelId)"
          >
            <LockClosedIcon v-if="getSettings(model.modelId).locked" class="h-4 w-4" />
            <LockOpenIcon v-else class="h-4 w-4" />
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
import { LockClosedIcon, LockOpenIcon, EyeIcon, EyeSlashIcon } from '@heroicons/vue/24/outline'

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

const getSettings = (modelId: string) => {
  return visualStore.getModelContextSettings(modelId)
}

const toggleVisibility = (modelId: string) => {
  const current = getSettings(modelId)
  const newSettings = { ...current, visible: !current.visible }

  visualStore.setModelContextMode(modelId, newSettings)
  visualStore.viewerEmit('applyContextMode', modelId, newSettings)
  visualStore.writeContextModeToFile()
}

const toggleLock = (modelId: string) => {
  const current = getSettings(modelId)
  const newSettings = { ...current, locked: !current.locked }

  visualStore.setModelContextMode(modelId, newSettings)
  visualStore.viewerEmit('applyContextMode', modelId, newSettings)
  visualStore.writeContextModeToFile()
}
</script>
