import { FilteringState } from '@speckle/viewer'

export function projectToScreen(cam, loc) {
  cam.updateProjectionMatrix()
  const copy = loc.clone()
  copy.project(cam)
  return {
    x: (copy.x * 0.5 + 0.5) * window.innerWidth - 10,
    y: (copy.y * -0.5 + 0.5) * window.innerHeight
  }
}

export interface Hit {
  guid: string
  object?: Record<string, unknown>
  point: { x: number; y: number; z: number }
}
export function pickViewableHit(hits: Hit[], state: FilteringState): Hit | null {
  let hit = null
  if (state.isolatedObjects) {
    // Find the first hit contained in the isolated objects
    hit = hits.find((hit) => {
      const hitId = hit.object.id as string
      return state.isolatedObjects.includes(hitId)
    })
  }
  return hit
}

export const createViewerContainerDiv = (parent: HTMLElement) => {
  const container = parent.appendChild(document.createElement('div'))
  container.style.backgroundColor = 'transparent'
  container.style.height = '100%'
  container.style.width = '100%'
  container.style.position = 'fixed'
  return container
}
