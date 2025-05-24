import type { ViewMode } from '@speckle/viewer'
import type { ModifierKeys, ViewerShortcuts } from './shortcuts'

export type BaseShortcut = {
  name: string
  description: string
  modifiers: readonly ModifierKeys[]
  key: string
  action: string
}

export type ViewModeShortcut = BaseShortcut & {
  viewMode: ViewMode
}

export type ViewerShortcut = (typeof ViewerShortcuts)[keyof typeof ViewerShortcuts]
export type ViewerShortcutAction = keyof typeof ViewerShortcuts
