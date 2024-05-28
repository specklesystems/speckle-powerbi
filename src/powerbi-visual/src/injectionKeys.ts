import { InjectionKey } from 'vue'
import SelectionHandler from 'src/handlers/selectionHandler'
import TooltipHandler from 'src/handlers/tooltipHandler'
import { Store } from 'vuex'
import { SpeckleVisualState } from 'src/store'
import ViewerHandler from 'src/handlers/viewerHandler'

export const selectionHandlerKey: InjectionKey<SelectionHandler> = Symbol()
export const tooltipHandlerKey: InjectionKey<TooltipHandler> = Symbol()
export const hostKey: InjectionKey<powerbi.extensibility.visual.IVisualHost> = Symbol()
export const storeKey: InjectionKey<Store<SpeckleVisualState>> = Symbol()
export const viewerHandlerKey: InjectionKey<ViewerHandler> = Symbol()
