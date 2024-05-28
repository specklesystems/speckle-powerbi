import { ref, onMounted, onUnmounted, Ref } from 'vue'

// by convention, composable function names start with "use"
export function useClickDragged(threshold = 1) {
  // state encapsulated and managed by the composable
  const dragged = ref(false)
  const distance = ref(0)
  const start: Ref<{ x: number; y: number }> = ref(null)
  const current: Ref<{ x: number; y: number }> = ref(null)
  function onPointerMove(ev) {
    distance.value = Math.sqrt(
      Math.pow(ev.x - start.value.x, 2) * Math.pow(ev.y - start.value.y, 2)
    )
    if (distance.value > threshold) {
      dragged.value = true
    }
  }

  function onPointerDown(ev) {
    dragged.value = false
    start.value = { x: ev.x, y: ev.y }
    current.value = start.value
    distance.value = 0
    document.addEventListener('pointermove', onPointerMove)
  }

  function onPointerUp(_) {
    if (dragged.value === false) reset()

    document.removeEventListener('pointermove', onPointerMove)
  }
  function reset() {
    start.value = null
    current.value = null
    distance.value = 0
  }

  // a composable can also hook into its owner component's
  // lifecycle to setup and teardown side effects.
  onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerup', onPointerUp)
  })
  onUnmounted(() => {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('pointerup', onPointerUp)
  })

  // expose managed state as return value
  return { dragged, distance }
}
