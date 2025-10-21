<template>
  <div>
    <transition name="slide-fade">
      <nav
        v-show="!visualStore.isNavbarHidden"
        class="fixed top-0 h-9 flex items-center bg-foundation border border-outline-2 w-full transition z-20 cursor-default"
      >
        <div class="flex items-center transition-all justify-between w-full">
          <div
            v-if="visualStore.receiveInfo.workspaceName"
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
              v{{ visualStore.receiveInfo.version }}
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

    <div
      v-if="!isInteractive"
      class="absolute left-1/2 -translate-x-1/2 z-20 bg-white bg-opacity-70 text-black text-center text-xs px-4 py-1 rounded shadow font-medium cursor-default transition-all duration-300"
      :class="visualStore.isNavbarHidden ? 'top-1' : 'top-11'"
    >
      <strong>Object IDs</strong>
      field is needed for interactivity with other visuals.
    </div>

    <div v-if="visualStore.isNavbarHidden" class="fixed top-0 right-0 z-20">
      <button
        class="transition opacity-50 hover:opacity-100"
        title="Show navbar"
        @click="visualStore.toggleNavbar()"
      >
        <ChevronDownIcon class="w-4 h-4 text-gray-400" />
      </button>
    </div>

    <transition name="slide-left">
      <ViewerControls
        v-show="!visualStore.isNavbarHidden"
        v-model:section-box="bboxActive"
        :views="views"
        class="fixed top-11 left-2 z-30"
        @view-clicked="(view) => viewerHandler.setView(view)"
        @view-mode-clicked="(viewMode) => viewerHandler.setViewMode(viewMode)"
      />
    </transition>

    <div v-if="visualStore.isFilterActive" class="absolute bottom-5 left-1/2 -translate-x-1/2 z-50">
      <FormButton size="sm" @click="visualStore.resetFilters(), selectionHandler.reset()">
        Reset filters
      </FormButton>
    </div>

    <div
      class="absolute z-10 flex items-center text-xs cursor-pointer"
      :class="visualStore.isBrandingHidden ? 'bottom-0 right-0' : 'bottom-2 right-2'"
      @click.stop="goToSpeckleWebsite"
    >
      <!-- TODO: fade bottom here as transition -->
      <transition name="fade-bottom">
        <div
          v-if="!visualStore.isBrandingHidden"
          class="flex items-center justify-center font-thin"
        >
          <div class="">Powered by</div>
          <img class="w-4 h-auto mx-1" src="@assets/logo-big.png" />
          <div class="font-medium">Speckle</div>
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
import { SpeckleView } from '@speckle/viewer'
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
let bboxActive = ref(false)
let views: Ref<SpeckleView[]> = ref([])

const isInteractive = computed(
  () => visualStore.fieldInputState.rootObjectId && visualStore.fieldInputState.objectIds
)

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

    // check if the objects are set to interactive before triggering selection
    const isInteractive = visualStore.isObjectInteractive(id)

    if (isInteractive) {
      // only register selection if object is from a interactive model
      if (isMultiSelect || !selectionHandler.isSelected(id)) {
        await selectionHandler.select(id, isMultiSelect)
      }
    } else {
      console.log(`🚫 Object ${id} is from a non-interactive model, skipping PowerBI selection`)
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

.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.3s ease;
}
.slide-left-enter-from,
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-20px);
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
