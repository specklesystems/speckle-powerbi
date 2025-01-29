import 'core-js/stable'
import 'regenerator-runtime/runtime'
import '../style/visual.css'
import { FormattingSettingsService } from 'powerbi-visuals-utils-formattingmodel'
import { createApp } from 'vue'
import App from './App.vue'
// import { store } from 'src/store'
import { selectionHandlerKey, tooltipHandlerKey } from 'src/injectionKeys'

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

import { pinia } from './plugins/pinia'
import { FieldInputState, useVisualStore } from './store/visualStore'

// noinspection JSUnusedGlobalSymbols
export class Visual implements IVisual {
  private readonly host: powerbi.extensibility.visual.IVisualHost
  private selectionHandler: SelectionHandler
  private tooltipHandler: TooltipHandler
  private isFirstViewerLoad: boolean

  private formattingSettings: SpeckleVisualSettingsModel
  private formattingSettingsService: FormattingSettingsService

  // noinspection JSUnusedGlobalSymbols
  public constructor(options: VisualConstructorOptions) {
    this.isFirstViewerLoad = true
    Tracker.loaded()
    this.host = options.host
    this.formattingSettingsService = new FormattingSettingsService()

    console.log('🚀 Init handlers')
    this.selectionHandler = new SelectionHandler(this.host)
    this.tooltipHandler = new TooltipHandler(this.host.tooltipService as ITooltipService)

    console.log('🚀 Init Vue App')
    createApp(App)
      .use(pinia)
      // .use(store, storeKey)
      .provide(selectionHandlerKey, this.selectionHandler)
      .provide(tooltipHandlerKey, this.tooltipHandler)
      .mount(options.element)

    // set `host` to visual store to be able use later in other components if needed
    const visualStore = useVisualStore()
    visualStore.setHost(this.host)
    this.host.refreshHostData() // to be able to trigger `update` function after constructor! by this way i was able to trigger viewer load objects from properties store
  }

  private async clear() {
    this.selectionHandler.clear()
  }

  public async update(options: VisualUpdateOptions) {
    const visualStore = useVisualStore()
    // @ts-ignore
    console.log('⤴️ Update type 👉', powerbi.VisualUpdateType[options.type])
    this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
      SpeckleVisualSettingsModel,
      options.dataViews[0]
    )

    console.log('Selector colors', this.formattingSettings.colorSelector)

    try {
      const matrixView = options.dataViews[0].matrix
      if (!matrixView) throw new Error('Data does not contain a matrix data view') // TODO: Could be toast notificiation too!

      // we first need to check which inputs user provided to decide our strategy
      const validationResult = validateMatrixView(options)
      visualStore.setFieldInputState(validationResult)
      console.log('❓Field inputs', validationResult)

      switch (options.type) {
        case powerbi.VisualUpdateType.Resize:
        case powerbi.VisualUpdateType.ResizeEnd:
        case powerbi.VisualUpdateType.Style:
        case powerbi.VisualUpdateType.ViewMode:
        case powerbi.VisualUpdateType.Resize + powerbi.VisualUpdateType.ResizeEnd:
          return
        case powerbi.VisualUpdateType.Data:
          try {
            // read saved data from file if any
            if (this.isFirstViewerLoad && options.dataViews[0].metadata.objects) {
              const objectsFromFile = JSON.parse(
                options.dataViews[0].metadata.objects.storedData?.fullData as string
              )
              if (visualStore.lastLoadedRootObjectId !== objectsFromFile[0].id) {
                this.tryReadFromFile(objectsFromFile, visualStore)
              }
            }

            const input = await processMatrixView(
              matrixView,
              this.host,
              validationResult.colorBy,
              this.formattingSettings,
              (obj, id) => this.selectionHandler.set(obj, id)
            )
            this.updateViewer(input)
          } catch (error) {
            console.error('Data update error', error ?? 'Unknown')
          }
          break
        default:
          return
      }
    } catch (e) {
      console.log('❌Input not valid:', (e as Error).message)
      this.host.displayWarningIcon(
        `Incomplete data input.`,
        `"Viewer Data" and "Object IDs" data inputs are mandatory. If your data connector does not output all these columns, please update it.`
      )
      console.warn(
        `Incomplete data input. "Viewer Data", "Object IDs" data inputs are mandatory. If your data connector does not output all these columns, please update it.`
      )
      visualStore.setFieldInputState({
        rootObjectId: false,
        objectIds: false,
        colorBy: false,
        tooltipData: false
      })
      return
    }
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    console.log('Showing Formatting settings', this.formattingSettings)
    const model = this.formattingSettingsService.buildFormattingModel(this.formattingSettings)
    console.log('Formatting model was created', model)
    return model
  }

  private updateViewer(input: SpeckleDataInput) {
    const visualStore = useVisualStore()

    this.tooltipHandler.setup(input.objectTooltipData)
    visualStore.setViewerReadyToLoad()

    if (visualStore.isViewerInitialized && !visualStore.viewerReloadNeeded) {
      visualStore.setDataInput(input)
    } else {
      // we should give some time to Vue to render ViewerWrapper component to be able to have proper emitter setup. Happiness level 6/10
      setTimeout(() => {
        visualStore.setDataInput(input)
        visualStore.writeObjectsToFile(input.objects)
      }, 250)
    }
  }

  private tryReadFromFile(objectsFromFile: object[], visualStore) {
    visualStore.setViewerReadyToLoad()
    setTimeout(() => {
      visualStore.loadObjectsFromFile(objectsFromFile)
      this.isFirstViewerLoad = false
    }, 250)
    console.log(`${objectsFromFile.length} objects retrieved from persistent properties!`)
  }

  public async destroy() {
    await this.clear()
  }
}
