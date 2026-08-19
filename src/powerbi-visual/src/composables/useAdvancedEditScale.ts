import { useWindowSize } from '@vueuse/core'
import { computed } from 'vue'

/**
 * UI scale for the Advanced Edit configuration page.
 *
 * In the report canvas the host scales the visual together with the page zoom
 * ("Fit to page"), so the fixed-px UI reads fine there. Advanced Edit instead
 * hands the visual the ENTIRE editor surface at 1:1 — on large / high-DPI
 * monitors (4K) that leaves the configuration UI far too small. Scale it
 * proportionally to the surface width: laptop-sized editors stay at the
 * familiar 1:1, big surfaces grow up to 2x. Applied via CSS `zoom` (layout-
 * affecting, crisp text — supported everywhere the PBI sandbox runs).
 */
export function useAdvancedEditScale() {
  const { width } = useWindowSize()
  return computed(() => Math.min(2, Math.max(1, width.value / 1400)))
}
