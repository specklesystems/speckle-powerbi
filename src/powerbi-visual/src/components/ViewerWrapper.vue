<template>
  <div class="flex flex-col justify-center items-center">
    <div
      ref="container"
      class="fixed h-full w-full z-0"
      @click="onCanvasClick"
      @auxclick="onCanvasAuxClick"
    />
    <!-- <div class="z-30 w-1/2 px-10">
      <common-loading-bar :loading="isLoading" />
    </div> -->
    <viewer-controls
      v-model:section-box="bboxActive"
      :views="views"
      class="fixed bottom-6"
      @view-clicked="(view) => viewerHandler.setView(view)"
    />
  </div>
</template>

<script async setup lang="ts">
import { inject, onBeforeUnmount, onMounted, Ref, ref } from 'vue'
import { currentOS, OS } from '../utils/detectOS'
import ViewerControls from 'src/components/ViewerControls.vue'
import { CanonicalView, SpeckleView } from '@speckle/viewer'
import { useClickDragged } from 'src/composables/useClickDragged'
import { ContextOption } from 'src/settings/colorSettings'
import { useVisualStore } from '@src/store/visualStore'
import { ViewerHandler } from '@src/plugins/viewer'
import { selectionHandlerKey, tooltipHandlerKey } from '@src/injectionKeys'

const visualStore = useVisualStore()
const { dragged } = useClickDragged()

const selectionHandler = inject(selectionHandlerKey)
const tooltipHandler = inject(tooltipHandlerKey)

let viewerHandler: ViewerHandler = null

const container = ref<HTMLElement>()
let bboxActive = ref(false)
let views: Ref<SpeckleView[]> = ref([])

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
    const id = hit.object.id as string
    if (multi || !selectionHandler.isSelected(id)) {
      await selectionHandler.select(id, multi)
    }
    tooltipHandler.show(hit, { x: ev.clientX, y: ev.clientY })
    const selection = selectionHandler.getCurrentSelection()
    const ids = selection.map((s) => s.id)
    await viewerHandler.selectObjects(ids)
  } else {
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
