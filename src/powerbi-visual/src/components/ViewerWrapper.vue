<template>
  <div class="border">
    <transition name="slide-fade">
      <nav
        v-show="!isNavbarCollapsed"
        class="fixed top-0 h-9 flex items-center bg-foundation border-b border-outline-2 w-full transition z-20 shadow-sm cursor-default"
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

          <div class="flex items-center">
            <div class="font-thin text-xs mr-2 text-gray-400">
              v{{ visualStore.receiveInfo.version }}
            </div>
            <button
              class="text-gray-400 hover:text-gray-700 transition"
              title="Hide navbar"
              @click="isNavbarCollapsed = true"
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
      :class="isNavbarCollapsed ? 'top-1' : 'top-11'"
    >
      <strong>Object IDs</strong>
      field is needed for interactivity with other visuals.
    </div>

    <div v-if="isNavbarCollapsed" class="fixed top-0 right-0 z-20">
      <button
        class="transition opacity-50 hover:opacity-100"
        title="Show navbar"
        @click="isNavbarCollapsed = false"
      >
        <ChevronDownIcon class="w-4 h-4 text-gray-400" />
      </button>
    </div>

    <transition name="slide-left">
      <ViewerControls
        v-show="!isNavbarCollapsed"
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
      class="absolute bottom-2 right-2 z-10 flex items-center text-xs cursor-pointer"
      @click="goToSpeckleWebsite"
    >
      <div class="flex items-center justify-center font-thin">
        <div class="">Powered by</div>
        <img class="w-4 h-auto mx-1" src="@assets/logo-big.png" />
        <div class="font-medium">Speckle</div>
      </div>
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

const isNavbarCollapsed = ref(false)

const isInteractive = computed(
  () => visualStore.fieldInputState.rootObjectId && visualStore.fieldInputState.objectIds
)

const goToSpeckleWebsite = () => visualStore.host.launchUrl('https://speckle.systems')

onMounted(async () => {
  console.log('Viewer Wrapper mounted')
  viewerHandler = new ViewerHandler()
  await viewerHandler.init(container.value)
  visualStore.setViewerEmitter(viewerHandler.emit)
})

onBeforeUnmount(async () => {
  await viewerHandler.dispose()
})

function isMultiSelect(e: MouseEvent) {
  if (!e) return false
  if (currentOS === OS.MacOS) return e.metaKey || e.shiftKey
  else return e.ctrlKey || e.shiftKey
}

async function onCanvasClick(ev: MouseEvent) {
  if (dragged.value) return

  const intersectResult = await viewerHandler.intersect({ x: ev.clientX, y: ev.clientY })

  const multi = isMultiSelect(ev)
  const hit = intersectResult?.hit
  if (hit) {
    visualStore.setPostClickSkipNeeded(true)
    const id = hit.object.id as string
    if (multi || !selectionHandler.isSelected(id)) {
      await selectionHandler.select(id, multi)
    }
    tooltipHandler.show(hit, { x: ev.clientX, y: ev.clientY })
    const selection = selectionHandler.getCurrentSelection()
    const ids = selection.map((s) => s.id)
    await viewerHandler.selectObjects(ids)
  } else {
    visualStore.setPostClickSkipNeeded(false)
    tooltipHandler.hide()
    if (!multi) {
      selectionHandler.clear()
      await viewerHandler.selectObjects(null)
    }
  }
}

async function onCanvasAuxClick(ev: MouseEvent) {
  if (ev.button != 2 || dragged.value) return
  const intersectResult = await viewerHandler.intersect({ x: ev.clientX, y: ev.clientY })
  await selectionHandler.showContextMenu(ev, intersectResult?.hit)
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
</style>
