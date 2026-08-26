<template>
  <div>
    <transition name="slide-fade">
      <nav
        v-show="!visualStore.isNavbarHidden"
        class="fixed top-0 h-9 flex items-center bg-foundation border border-outline-2 w-full transition z-20 cursor-default"
      >
        <div class="flex items-center transition-all justify-between w-full">
          <div
            v-if="visualStore.receiveInfo?.workspaceName"
            class="flex items-center gap-2 p-0.5 pr-1.5 hover:bg-highlight-2 rounded ml-2"
          >
            <WorkspaceAvatar
              :name="visualStore.receiveInfo.workspaceName"
              :logo="visualStore.receiveInfo.workspaceLogo"
            ></WorkspaceAvatar>
            <div class="min-w-0 truncate flex-grow text-left text-xs">
              <span>{{ visualStore.receiveInfo.workspaceName }}</span>
            </div>
          </div>
          <div v-else>
            <div class="flex items-center hover:cursor-pointer" @click="goToSpeckleWebsite">
              <div class="max-[200px]:hidden block ml-2">
                <img class="w-6 h-auto ml-1 mr-2 my-1" src="@assets/logo-big.png" />
              </div>
              <div class="font-sans font-medium">Speckle</div>
            </div>
          </div>

          <div class="flex items-center space-x-2">
            <FormButton
              v-if="visualStore.latestAvailableVersion && !visualStore.isConnectorUpToDate && visualStore.isRunningInDesktop"
              v-tippy="{
                content: 'New connector version is available.<br>Click to download.',
                allowHTML: true
              }"
              color="outline"
              size="sm"
              @click="visualStore.downloadLatestVersion"
            >
              Update
            </FormButton>
            <div class="font-thin text-xs text-gray-400">
              v{{ visualStore.receiveInfo?.version }}
            </div>
            <button
              class="text-gray-400 hover:text-gray-700 transition"
              title="Hide navbar"
              @click="visualStore.toggleNavbar()"
            >
              <ChevronUpIcon class="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>
    </transition>

    <!-- same row as the Home view's field list, so the prompt reads as the one
         still-missing item from that checklist rather than a separate warning -->
    <div
      v-if="!isInteractive"
      v-tippy="'Needed for interactivity with other visuals.'"
      class="absolute left-1/2 -translate-x-1/2 z-20 flex w-[280px] max-w-[calc(100%-1rem)] items-center gap-2.5 rounded border border-zinc-200 bg-white px-3 py-[9px] shadow cursor-default font-inter transition-all duration-300"
      :class="visualStore.isNavbarHidden ? 'top-1' : 'top-11'"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-3.5 w-3.5 shrink-0 text-blue-600"
      >
        <path
          d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"
        />
      </svg>
      <!-- flex-1 pushes "Required" to the right edge, same as the Home row -->
      <span class="flex-1 text-xs font-semibold leading-[1.2] text-zinc-900">Object Keys</span>
      <span class="shrink-0 text-[11px] font-medium leading-[1.2] text-blue-600">Required</span>
    </div>

    <div
      v-if="hasLegacyModels"
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 bg-white bg-opacity-90 text-black text-center text-xs px-6 py-4 rounded shadow font-medium cursor-default max-w-md"
    >
      <p class="mb-1"><strong>This version predates Speckle 4.0.</strong></p>
      <p>
        Table data was loaded through the legacy pipeline, but the 3D view needs a 4.0 artifact
        bundle. Publish a new version from a Speckle 4.0 connector to enable the 3D view.
      </p>
    </div>

    <div v-if="visualStore.isNavbarHidden" class="fixed top-4 right-2 z-20">
      <button
        class="transition opacity-50 hover:opacity-100"
        title="Show navbar"
        @click="visualStore.toggleNavbar()"
      >
        <ChevronDownIcon class="w-4 h-4 text-gray-400" />
      </button>
    </div>

    <!-- centering lives on the wrapper so the transition's transform doesn't
         fight the -translate-x-1/2 that holds the toolbar on the midline -->
    <div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
      <transition name="slide-up">
        <ViewerControls
          v-show="!visualStore.isNavbarHidden"
          :views="views"
          @view-clicked="(view) => viewerHandler.setView(view)"
        />
      </transition>
    </div>

    <!-- sits above the bottom-center toolbar rather than on top of it -->
    <div v-if="visualStore.isFilterActive" class="absolute bottom-16 left-1/2 -translate-x-1/2 z-50">
      <FormButton size="sm" @click="visualStore.resetFilters(), selectionHandler.reset()">
        Reset filters
      </FormButton>
    </div>

    <!-- the ONE loading-status home: blocking-phase text (index/preparing/streaming
         pre-paint — the center shows only a spinner) hands over to the post-paint
         out-of-core streaming ticker. Rate is instantaneous and legitimately 0
         between response waves on slow links — cumulative MB always, rate only
         when it means something. Diagnostics ACCESS is Dev-mode-gated: with it
         off the pill only reports active progress (idle launcher hidden, click
         does nothing); with it on, click toggles the diagnostics HUD (Desktop
         has no reachable console) -->
    <div
      v-if="visualStore.isDevMode || loadingStatusText"
      class="absolute bottom-2 left-2 z-20 flex items-center gap-1.5 bg-white bg-opacity-80 text-gray-700 text-xs px-2.5 py-1 rounded-full shadow select-none"
      :class="visualStore.isDevMode ? 'cursor-pointer' : 'cursor-default'"
      :title="visualStore.isDevMode ? 'Click for diagnostics' : undefined"
      @click.stop="visualStore.isDevMode && visualStore.toggleDiag()"
    >
      <span
        class="inline-block w-2 h-2 rounded-full"
        :class="loadingStatusText ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'"
      ></span>
      <span>{{ loadingStatusText ?? 'Speckle diagnostics' }}</span>
    </div>

    <!-- diagnostics HUD: live renderer stats + last significant events -->
    <div
      v-if="visualStore.isDevMode && visualStore.diagVisible"
      class="absolute bottom-9 left-2 z-30 w-[26rem] max-w-[85vw] max-h-56 overflow-y-auto bg-white bg-opacity-95 text-gray-800 rounded shadow-lg p-2 font-mono text-[10px] leading-snug cursor-default"
    >
      <div class="font-semibold border-b border-gray-200 pb-1 mb-1">
        {{ visualStore.diagStats || 'no stream stats yet' }}
      </div>
      <div v-if="visualStore.diagEvents.length === 0" class="text-gray-400">no events yet</div>
      <div v-for="(line, i) in visualStore.diagEvents" :key="i">{{ line }}</div>
    </div>

    <div
      class="absolute z-10 flex items-center text-xs cursor-pointer font-inter"
      :class="visualStore.isBrandingHidden ? 'bottom-0 right-0' : 'bottom-2 right-2'"
      @click.stop="goToSpeckleWebsite"
    >
      <!-- TODO: fade bottom here as transition -->
      <transition name="fade-bottom">
        <div
          v-if="!visualStore.isBrandingHidden"
          class="flex items-center justify-center text-zinc-600"
        >
          <div>Powered by</div>
          <img class="h-5 w-auto ml-1.5" src="@assets/logo-full.svg" alt="Speckle" />
        </div>
      </transition>
      <button
        v-if="visualStore.receiveInfo && visualStore.receiveInfo.canHideBranding"
        class="transition opacity-50 hover:opacity-100 ml-1"
        :title="visualStore.isBrandingHidden ? '' : 'Hide branding'"
        @click.stop="visualStore.toggleBranding()"
      >
        <ChevronUpIcon v-if="visualStore.isBrandingHidden" class="w-4 h-4 text-gray-400" />
        <ChevronDownIcon v-else class="w-4 h-4" />
      </button>
    </div>

    <div
      ref="container"
      class="fixed h-full w-full z-0 cursor-default"
      @click="onCanvasClick"
      @auxclick="onCanvasAuxClick"
    />
  </div>
</template>

<script async setup lang="ts">
import FormButton from '@src/components/form/FormButton.vue'
import { computed, inject, onBeforeUnmount, onMounted, Ref, ref } from 'vue'
import { currentOS, OS } from '../utils/detectOS'
import ViewerControls from 'src/components/ViewerControls.vue'
import { SpeckleView } from '@src/viewer3/compatTypes'
import { useClickDragged } from 'src/composables/useClickDragged'
import { useVisualStore } from '@src/store/visualStore'
import { ViewerHandler } from '@src/plugins/viewer'
import { selectionHandlerKey, tooltipHandlerKey } from '@src/injectionKeys'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/vue/24/outline'
import WorkspaceAvatar from './workspace/WorkspaceAvatar.vue'

const visualStore = useVisualStore()
const { dragged } = useClickDragged()

const selectionHandler = inject(selectionHandlerKey)
const tooltipHandler = inject(tooltipHandlerKey)

let viewerHandler: ViewerHandler = null

const container = ref<HTMLElement>()
const views: Ref<SpeckleView[]> = ref([])

const isInteractive = computed(
  () => visualStore.fieldInputState.modelInfo && visualStore.fieldInputState.applicationIds
)

// Bottom-left status pill: blocking-phase text wins; streaming ticker takes over post-paint
const loadingStatusText = computed(() => {
  if (visualStore.loadingProgress) return visualStore.loadingProgress.summary
  const stats = visualStore.streamingStats
  if (!stats) return null
  const rate = stats.mbPerSec >= 0.05 ? ` · ${stats.mbPerSec.toFixed(1)} MB/s` : ''
  return `Streaming — ${stats.totalMB.toFixed(0)} MB${rate}`
})

const hasLegacyModels = computed(() => visualStore.dataInput?.hasLegacyModels ?? false)

const goToSpeckleWebsite = () => visualStore.host.launchUrl('https://speckle.systems')

onMounted(async () => {
  console.log('Viewer Wrapper mounted')
  viewerHandler = new ViewerHandler()
  await viewerHandler.init(container.value)
  
  // Set up event listener for object clicks from the FilteredSelectionExtension
  viewerHandler.emitter.on('objectClicked', handleObjectClicked)

  visualStore.setViewerEmitter(viewerHandler.emit)
})

onBeforeUnmount(async () => {
  await viewerHandler.dispose()
})

async function handleObjectClicked(hit: any, isMultiSelect: boolean, mouseEvent?: PointerEvent) {
  // Skip if dragging occurred
  if (dragged.value) return
  
  console.log('🎯 Object clicked in ViewerWrapper:', hit, isMultiSelect)
  
  if (hit) {
    visualStore.setPostClickSkipNeeded(true)
    const id = hit.object.id as string
    if (isMultiSelect || !selectionHandler.isSelected(id)) {
      await selectionHandler.select(id, isMultiSelect)
    }
    
    // Show tooltip if we have mouse coordinates
    if (mouseEvent) {
      tooltipHandler.show(hit, { x: mouseEvent.clientX, y: mouseEvent.clientY })
    }
    
    const selection = selectionHandler.getCurrentSelection()
    const ids = selection.map((s) => s.id)
    await viewerHandler.selectObjects(ids)
  } else {
    visualStore.setPostClickSkipNeeded(false)
    tooltipHandler.hide()
    if (!isMultiSelect) {
      selectionHandler.clear()
      await viewerHandler.selectObjects(null)
    }
  }
}

function onCanvasClick(ev: MouseEvent) {
  // This click handler allows the viewer's built-in input system to handle clicks
  // The viewer will emit ViewerEvent.ObjectClicked events which the SelectionExtension handles
  console.log('🖱️ Canvas click detected:', ev.clientX, ev.clientY)
  
  // Let the event propagate to the viewer's input system
  // The viewer should handle the click and emit ViewerEvent.ObjectClicked
}

async function onCanvasAuxClick(ev: MouseEvent) {
  if (ev.button !== 2 || dragged.value) return
  
  // For right-clicks, we need to get the object at the click position
  // Since FilteredSelectionExtension doesn't handle right-clicks, we'll ask it for current selection
  const selectedObjects = viewerHandler.selection.getSelectedObjects()
  const hit = selectedObjects.length > 0 ? {
    guid: selectedObjects[0].id,
    object: selectedObjects[0],
    point: { x: 0, y: 0, z: 0 } // We don't have exact point for context menu
  } : null
  
  await selectionHandler.showContextMenu(ev, hit)
}
</script>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
.slide-fade-enter-to,
.slide-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

.fade-bottom-enter-active,
.fade-bottom-leave-active {
  transition: all 0.3s ease;
}
.fade-bottom-enter-from,
.fade-bottom-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
.fade-bottom-enter-to,
.fade-bottom-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
