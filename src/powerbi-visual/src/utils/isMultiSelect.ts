import { currentOS, OS } from './detectOS'

export function isMultiSelect(e: MouseEvent) {
  if (!e) return false
  if (currentOS === OS.MacOS) return e.metaKey || e.shiftKey
  else return e.ctrlKey || e.shiftKey
}
