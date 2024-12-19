import { InjectionKey } from 'vue'
import SelectionHandler from 'src/handlers/selectionHandler'
import TooltipHandler from 'src/handlers/tooltipHandler'

export const selectionHandlerKey: InjectionKey<SelectionHandler> = Symbol()
export const tooltipHandlerKey: InjectionKey<TooltipHandler> = Symbol()
