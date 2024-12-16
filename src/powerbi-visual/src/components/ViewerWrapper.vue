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
      v-if="!isLoading"
      v-model:section-box="bboxActive"
      :views="views"
      class="fixed bottom-6"
      @view-clicked="(view) => viewerHandler.setView(view)"
      @clear-palette="onClearPalette"
    />
  </div>
</template>

<script async setup lang="ts">
import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  provide,
  Ref,
  ref,
  watch,
  watchEffect
} from 'vue'
import ViewerControls from 'src/components/ViewerControls.vue'
import { CanonicalView, SpeckleView } from '@speckle/viewer'
import { FormButton } from '@speckle/ui-components'
import { useClickDragged } from 'src/composables/useClickDragged'
import { isMultiSelect } from 'src/utils/isMultiSelect'
import {
  selectionHandlerKey,
  tooltipHandlerKey,
  viewerHandlerKey
} from 'src/injectionKeys'
import { SpeckleDataInput } from 'src/types'
import { debounce, throttle } from 'lodash'
import { ContextOption } from 'src/settings/colorSettings'
import { useVisualStore } from '@src/store/visualStore'
import { ViewerHandler } from '@src/plugins/viewer'

const selectionHandler = inject(selectionHandlerKey)
const tooltipHandler = inject(tooltipHandlerKey)
const visualStore = useVisualStore()
const { dragged } = useClickDragged()

let viewerHandler: ViewerHandler = null
let ac = new AbortController()

const container = ref<HTMLElement>()
let bboxActive = ref(false)
let views: Ref<SpeckleView[]> = ref([])
let updateTask: Ref<Promise<void>> = ref(null)
let setupTask: Promise<void> = null

const isLoading = computed(() => updateTask.value != null)
const input = computed(() => visualStore.dataInput)
// const settings = computed(() => store.state.settings)

const onCameraMoved = throttle((_) => {
  const pos = tooltipHandler.currentTooltip?.worldPos
  if (!pos) return
  // const screenPos = viewerHandler.getScreenPosition(pos)
  // tooltipHandler.move(screenPos)
}, 50)

onMounted(async () => {
  console.log('Viewer Wrapper mounted');
  // viewerHandler = new ViewerHandler(container.value)
  // console.log('Viewer Handler created', viewerHandler);
  // provide<ViewerHandler>(viewerHandlerKey, viewerHandler)
  // await viewerHandler.init()
  // setupTask = viewerHandler
  //   .init()
  //   .then(() => viewerHandler.addCameraUpdateEventListener(onCameraMoved))
  //   .finally(async () => {
  //     await viewerHandler.loadObjects(obj, console.log, console.error)
  //     viewerHandler.updateSettings(settings.value)
  //   })
  const viewerHandler = new ViewerHandler()
  await viewerHandler.init(container.value)
  visualStore.setViewerEmitter(viewerHandler.emit)
})

onBeforeUnmount(async () => {
  // await viewerHandler.dispose()
})

const debounceUpdate = throttle(cancelAndHandleDataUpdate, 500)
//const debounceSettingsUpdate = throttle(() => viewerHandler.updateSettings(settings.value), 500)
watch(input, debounceUpdate)
//watch(settings, debounceSettingsUpdate)

watchEffect(() => {
  if (!isLoading.value) viewerHandler?.setSectionBox(bboxActive.value, input.value.objectIds)
})

async function handleDataUpdate(input: Ref<SpeckleDataInput>, signal: AbortSignal) {
  console.log("in handleDataUpdate");
  // if (input.value.objects){
  //   // await viewerHandler.unIsolateObjects()
  //   if (input.value.objects.length > maxObjectCount){
  //     maxObjectCount = input.value.objects.length

  //     console.log("loadObjectsWithAutoUnload called to re-render viewer!");
      
  //     viewerHandler.loadObjects(
  //       input.value.objects,
  //     )
  //   }
  //   else {
  //     console.log("DO NOT RELOAD OBJECTS IN VIEWER!");
  //     const objectsToIsolate = input.value.selectedIds.length == 0 ? input.value.objectIds : input.value.selectedIds
  //     if (input.value.selectedIds.length !== 0){
  //       await viewerHandler.unIsolateObjects()
  //       await viewerHandler.isolateObjects(objectsToIsolate, true)
  //     }
  //   }
  // }
  
  // updateTask.value = setupTask
  //   .then(async () => {
  //     signal.throwIfAborted()
  //     // Clear previous selection
  //     await viewerHandler.selectObjects(null)

  //     // Load
  //     await viewerHandler.loadObjectsWithAutoUnload(
  //       input.value.rootObject,
  //       console.log,
  //       console.error,
  //       signal
  //     )

  //     // Color
  //     await viewerHandler.colorObjectsByGroup(input.value.colorByIds)

  //     await viewerHandler.unIsolateObjects()
  //     const objectsToIsolate =
  //       input.value.selectedIds.length == 0 ? input.value.objectIds : input.value.selectedIds
  //     if (settings.value.color.context.value != ContextOption.show)
  //       await viewerHandler.isolateObjects(
  //         objectsToIsolate,
  //         settings.value.color.context.value === ContextOption.ghosted
  //       )
  //     if (settings.value.camera.zoomOnDataChange.value) viewerHandler.zoom(objectsToIsolate)

  //     // Update available views
  //     views.value = viewerHandler.getViews()
  //   })
  //   .catch((e: Error) => {
  //     console.log('Loading operation was aborted', e)
  //   })
  //   .finally(() => {
  //     updateTask.value = null
  //   })
}

async function cancelAndHandleDataUpdate() {
  console.log('Input has changed', input.value)
  // if (updateTask.value) {
  //   ac.abort('New input is available')
  //   console.log('Cancelling previous load job')
  //   await updateTask.value
  //   ac = new AbortController()
  // }
  const ac = new AbortController()
  const signal = ac.signal
  handleDataUpdate(input, signal)
}

async function onCanvasClick(ev: MouseEvent) {
  // if (dragged.value) return
  // const intersectResult = await viewerHandler.intersect({ x: ev.clientX, y: ev.clientY })
  // const multi = isMultiSelect(ev)
  // const hit = intersectResult?.hit
  // if (hit) {
  //   const id = hit.object.id as string
  //   if (multi || !selectionHandler.isSelected(id)) await selectionHandler.select(id, multi)
  //   tooltipHandler.show(hit, { x: ev.clientX, y: ev.clientY })
  //   const selection = selectionHandler.getCurrentSelection()
  //   const ids = selection.map((s) => s.id)
  //   await viewerHandler.selectObjects(ids)
  // } else {
  //   tooltipHandler.hide()
  //   if (!multi) {
  //     selectionHandler.clear()
  //     await viewerHandler.selectObjects(null)
  //   }
  // }
}

async function onCanvasAuxClick(ev: MouseEvent) {
  if (ev.button != 2 || dragged.value) return
  const intersectResult = await viewerHandler.intersect({ x: ev.clientX, y: ev.clientY })
  await selectionHandler.showContextMenu(ev, intersectResult?.hit)
}

function onClearPalette() {
  cancelAndHandleDataUpdate()
}
</script>


