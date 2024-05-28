import 'core-js/stable'
import 'regenerator-runtime/runtime'
import '../style/visual.css'
import * as _ from 'lodash'
import { FormattingSettingsService } from 'powerbi-visuals-utils-formattingmodel'
import { createApp } from 'vue'
import App from './App.vue'
import { store } from 'src/store'
import { hostKey, selectionHandlerKey, tooltipHandlerKey, storeKey } from 'src/injectionKeys'

import { Tracker } from './utils/mixpanel'
import { SpeckleDataInput } from './types'
import { processMatrixView, validateMatrixView } from './utils/matrixViewUtils'
import { SpeckleVisualSettingsModel } from './settings/visualSettingsModel'

import TooltipHandler from './handlers/tooltipHandler'
import SelectionHandler from './handlers/selectionHandler'

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions
import IVisual = powerbi.extensibility.visual.IVisual
import ITooltipService = powerbi.extensibility.ITooltipService
import {
  createDataViewWildcardSelector,
  DataViewWildcardMatchingOption
} from 'powerbi-visuals-utils-dataviewutils/lib/dataViewWildcard'
import { ColorSelectorSettings } from 'src/settings/colorSettings'

// noinspection JSUnusedGlobalSymbols
export class Visual implements IVisual {
  private readonly host: powerbi.extensibility.visual.IVisualHost
  private selectionHandler: SelectionHandler
  private tooltipHandler: TooltipHandler

  private formattingSettings: SpeckleVisualSettingsModel
  private formattingSettingsService: FormattingSettingsService

  // noinspection JSUnusedGlobalSymbols
  public constructor(options: VisualConstructorOptions) {
    Tracker.loaded()
    this.host = options.host
    this.formattingSettingsService = new FormattingSettingsService()

    console.log('🚀 Init handlers')
    this.selectionHandler = new SelectionHandler(this.host)
    this.tooltipHandler = new TooltipHandler(this.host.tooltipService as ITooltipService)

    console.log('🚀 Init Vue App')
    createApp(App)
      .use(store, storeKey)
      .provide(selectionHandlerKey, this.selectionHandler)
      .provide(tooltipHandlerKey, this.tooltipHandler)
      .provide(hostKey, options.host)
      .mount(options.element)
  }

  private async clear() {
    this.selectionHandler.clear()
  }

  public update(options: VisualUpdateOptions) {
    // @ts-ignore
    console.log('⤴️ Update type 👉', powerbi.VisualUpdateType[options.type])
    this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
      SpeckleVisualSettingsModel,
      options.dataViews
    )

    console.log('Selector colors', this.formattingSettings.colorSelector)
    let validationResult: { hasColorFilter: boolean; view: powerbi.DataViewMatrix } = null
    try {
      console.log('🔍 Validating input...', options)
      validationResult = validateMatrixView(options)
      console.log('✅Input valid', validationResult)
    } catch (e) {
      console.log('❌Input not valid:', (e as Error).message)
      this.host.displayWarningIcon(
        `Incomplete data input.`,
        `"Model URL", "Version Object ID" and "Object ID" data inputs are mandatory. If your data connector does not output all these columns, please update it.`
      )
      console.warn(
        `Incomplete data input. "Model URL", "Version Object ID" and "Object ID" data inputs are mandatory. If your data connector does not output all these columns, please update it.`
      )
      store.commit('setStatus', 'incomplete')
      return
    }

    switch (options.type) {
      case powerbi.VisualUpdateType.Resize:
      case powerbi.VisualUpdateType.ResizeEnd:
      case powerbi.VisualUpdateType.Style:
      case powerbi.VisualUpdateType.ViewMode:
      case powerbi.VisualUpdateType.Resize + powerbi.VisualUpdateType.ResizeEnd:
        return
      default:
        try {
          const input = processMatrixView(
            validationResult.view,
            this.host,
            validationResult.hasColorFilter,
            this.formattingSettings,
            (obj, id) => this.selectionHandler.set(obj, id)
          )
          this.throttleUpdate(input)
        } catch (error) {
          console.error('Data update error', error ?? 'Unknown')
        }
    }
  }
  public getFormattingModel(): powerbi.visuals.FormattingModel {
    console.log('Showing Formatting settings', this.formattingSettings)
    const model = this.formattingSettingsService.buildFormattingModel(this.formattingSettings)
    console.log('Formatting model was created', model)
    return model
  }

  private throttleUpdate = _.throttle((input: SpeckleDataInput) => {
    this.tooltipHandler.setup(input.objectTooltipData)
    store.commit('setInput', input)
    store.commit('setStatus', 'valid')
    store.commit('setSettings', this.formattingSettings)
  }, 500)

  public async destroy() {
    await this.clear()
  }
}
