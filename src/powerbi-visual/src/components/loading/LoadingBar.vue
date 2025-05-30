<template>
  <div class="w-full text-xs text-foreground-on-primary space-y-1">
    <!-- Bar container -->
    <div
      :class="[
        'w-full h-1 overflow-hidden rounded-xl bg-blue-500/30',
        showBar ? 'opacity-100' : 'opacity-0'
      ]"
    >
      <!-- Swooshing animation -->
      <div v-if="isIndeterminate" class="swoosher top-0 left-0 h-full bg-blue-500/50"></div>

      <!-- Determinate progress bar -->
      <div
        v-else
        class="top-0 left-0 h-full bg-blue-500 transition-all duration-300 ease-linear"
        :style="{ width: `${progressPercent + 20}%` }"
      ></div>
    </div>

    <!-- Progress text below -->
    <div v-if="isIndeterminate" class="text-[13px] text-center text-foreground-2">
      {{ props.progress.summary }}
    </div>
    <div v-else class="text-[13px] text-center text-foreground-2">
      {{ progressPercent.toFixed(0) }}% ({{ props.progress.summary }})
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useMounted } from '@vueuse/core'
import { LoadingProgress } from '@src/store/visualStore'

const props = defineProps<{ progress: LoadingProgress; clientOnly?: boolean }>()

const mounted = useMounted()
const showBar = computed(() => (mounted.value || !props.clientOnly) && !!props.progress)
const isIndeterminate = computed(() => props.progress.progress == null)
const progressPercent = computed(() => (props.progress.progress ?? 0) * 100)
</script>

<style scoped>
.swoosher {
  width: 100%;
  height: 100%;
  animation: swoosh 1s infinite linear;
  transform-origin: 0% 30%;
}

@keyframes swoosh {
  0% {
    transform: translateX(0) scaleX(0);
  }
  40% {
    transform: translateX(0) scaleX(0.4);
  }
  100% {
    transform: translateX(100%) scaleX(0.5);
  }
}
</style>
