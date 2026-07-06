import 'core-js/stable'
import 'regenerator-runtime/runtime'
import '../style/visual.css'
import { FormattingSettingsService } from 'powerbi-visuals-utils-formattingmodel'
import { createApp } from 'vue'
import App from './App.vue'
import VueTippy from 'vue-tippy'
import { selectionHandlerKey, tooltipHandlerKey } from 'src/injectionKeys'

import { SpeckleDataInput } from './types'
import { processMatrixView, ReceiveInfo, validateMatrixView } from './utils/matrixViewUtils'
import { SpeckleVisualSettingsModel } from './settings/visualSettingsModel'

import TooltipHandler from './handlers/tooltipHandler'
import SelectionHandler from './handlers/selectionHandler'

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions
import IVisual = powerbi.extensibility.visual.IVisual
import ITooltipService = powerbi.extensibility.ITooltipService

import { pinia } from './plugins/pinia'
import { useVisualStore } from './store/visualStore'

// VisualUpdateType is a bit-flag enum (powerbi-visuals-api). Defined locally as
// plain constants: the ambient `powerbi` runtime global is not reliably present
// in every host context and referencing it threw ReferenceError inside update().
const UpdateType = {
  Data: 1 << 1,
  Resize: 1 << 2,
  ViewMode: 1 << 3,
  Style: 1 << 4,
  ResizeEnd: 1 << 5
} as const

// noinspection JSUnusedGlobalSymbols
export class Visual implements IVisual {
  private readonly host: powerbi.extensibility.visual.IVisualHost
  private selectionHandler: SelectionHandler
  private tooltipHandler: TooltipHandler

  private formattingSettings: SpeckleVisualSettingsModel
  private formattingSettingsService: FormattingSettingsService

  // noinspection JSUnusedGlobalSymbols
  public constructor(options: VisualConstructorOptions) {
    try {
      this.host = options.host
      this.formattingSettingsService = new FormattingSettingsService()

      this.selectionHandler = new SelectionHandler(this.host)
      this.tooltipHandler = new TooltipHandler(this.host.tooltipService as ITooltipService)

      createApp(App)
        .use(pinia)
        .use(VueTippy, {
          defaultProps: {
            theme: 'custom'
          }
        })
        .provide(selectionHandlerKey, this.selectionHandler)
        .provide(tooltipHandlerKey, this.tooltipHandler)
        .mount(options.element)

      // set `host` to visual store to be able use later in other components if needed
      const visualStore = useVisualStore()
      visualStore.setHost(this.host)

      // trigger an update after construction so persisted-settings restore runs;
      // deferred + guarded: calling into the host synchronously during
      // initialization can throw in the sandboxed host
      setTimeout(() => {
        try {
          this.host.refreshHostData()
        } catch (e) {
          console.error('Speckle visual: refreshHostData failed', e)
        }
      }, 0)
    } catch (e) {
      // the sandbox's own error reporter chokes on non-Error throwables —
      // surface the real failure and rethrow something it can serialize
      console.error('Speckle visual: constructor failed', e)
      throw e instanceof Error ? e : new Error(String(e))
    }
  }

  private async clear() {
    this.selectionHandler.clear()
  }

  public async update(options: VisualUpdateOptions) {
    try {
      await this.updateInternal(options)
    } catch (e) {
      console.error('Speckle visual: update failed', e)
      throw e instanceof Error ? e : new Error(String(e))
    }
  }

  private async updateInternal(options: VisualUpdateOptions) {
    const visualStore = useVisualStore()
    if (visualStore.commonError) {
      visualStore.setCommonError(undefined)
      visualStore.setViewerReadyToLoad(false)
    }

    if (visualStore.postFileSaveSkipNeeded) {
      visualStore.setPostFileSaveSkipNeeded(false)
      console.log('Skipping unneccessary update function after file save.')
      return
    }

    if (visualStore.postClickSkipNeeded) {
      visualStore.setPostClickSkipNeeded(false)
      console.log('Skipping unneccessary update function canvas click.')
      return
    }

    this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
      SpeckleVisualSettingsModel,
      options.dataViews[0]
    )

    visualStore.setFormattingSettings(this.formattingSettings)

    try {
      const matrixView = options.dataViews[0].matrix
      if (!matrixView) throw new Error('Data does not contain a matrix data view') // TODO: Could be toast notificiation too!

      // we first need to check which inputs user provided to decide our strategy
      const validationResult = validateMatrixView(options)
      visualStore.setFieldInputState(validationResult)
      console.log('❓Field inputs', validationResult)

      // only react to Data updates; resize/style/viewmode-only updates are no-ops
      if (!(options.type & UpdateType.Data)) {
        return
      }
      {
          try {
            // read saved settings from file if any
            console.log('🔍 Checking for other saved settings:')

            if (!visualStore.isViewerObjectsLoaded && options.dataViews[0].metadata.objects) {
              const defaultViewMode = options.dataViews[0].metadata.objects.viewMode?.defaultViewMode
              if (defaultViewMode) {
                console.log(`Default View Mode: ${defaultViewMode as string}`)

                visualStore.setDefaultViewModeInFile(defaultViewMode as string)
              }

              const brandingHidden = options.dataViews[0].metadata.objects.workspace?.brandingHidden
              if (brandingHidden !== undefined) {
                console.log(`Branding Hidden: ${brandingHidden as boolean}`)

                visualStore.setBrandingHidden(brandingHidden as boolean)
              }

              const navbarHidden = options.dataViews[0].metadata.objects.viewMode?.navbarHidden
              if (navbarHidden !== undefined) {
                console.log(`Navbar Hidden: ${navbarHidden as boolean}`)

                visualStore.setNavbarHidden(navbarHidden as boolean)
              }

              // Load edges settings
              const viewModeSettings = options.dataViews[0].metadata.objects.viewMode
              if (viewModeSettings) {
                if ('edgesEnabled' in viewModeSettings) {
                  console.log(`Edges Enabled: ${viewModeSettings.edgesEnabled as boolean}`)
                  visualStore.setEdgesEnabled(viewModeSettings.edgesEnabled as boolean)
                }
                if ('edgesWeight' in viewModeSettings) {
                  console.log(`Edges Weight: ${viewModeSettings.edgesWeight as number}`)
                  visualStore.setEdgesWeight(viewModeSettings.edgesWeight as number)
                }
                if ('edgesColor' in viewModeSettings) {
                  const colorVal = viewModeSettings.edgesColor as number
                  console.log(`Edges Color: ${colorVal}`)
                  visualStore.setEdgesColor(colorVal === -1 ? 'auto' : colorVal)
                }
              }

              const cameraPositionData = options.dataViews[0].metadata.objects.cameraPosition
              if (cameraPositionData?.positionX) {
                console.log('Stored camera position is found')
                visualStore.setCameraPositionInFile([
                  Number(cameraPositionData.positionX),
                  Number(cameraPositionData.positionY),
                  Number(cameraPositionData.positionZ),
                  Number(cameraPositionData.targetX),
                  Number(cameraPositionData.targetY),
                  Number(cameraPositionData.targetZ)
                ])
              }

              const sectionBoxData = options.dataViews[0].metadata.objects.sectionBox?.boxData
              if (sectionBoxData) {
                console.log('Stored section box is found')
                visualStore.setSectionBoxData(sectionBoxData as string)
              }

              const camera = options.dataViews[0].metadata.objects.camera

              if (camera && 'isOrtho' in camera) {
                console.log(
                  `Projection is ortho?: ${
                    options.dataViews[0].metadata.objects.camera?.isOrtho as boolean
                  }`
                )

                visualStore.setIsOrthoProjection(
                  options.dataViews[0].metadata.objects.camera?.isOrtho as boolean
                )
              }

              if (camera && 'isGhost' in camera) {
                console.log(
                  `Is ghost?: ${options.dataViews[0].metadata.objects.camera?.isGhost as boolean}`
                )

                visualStore.setIsGhost(
                  options.dataViews[0].metadata.objects.camera?.isGhost as boolean
                )
              }

              if (camera && 'zoomOnFilter' in camera) {
                console.log(
                  `Zoom on filter?: ${
                    options.dataViews[0].metadata.objects.camera?.zoomOnFilter as boolean
                  }`
                )

                visualStore.setIsZoomOnFilterActive(
                  options.dataViews[0].metadata.objects.camera?.zoomOnFilter as boolean
                )
              }

              // get receive info from file for persistence
              try {
                const receiveInfoFromFile = JSON.parse(
                  options.dataViews[0].metadata.objects.storedData?.receiveInfo as string
                ) as ReceiveInfo
                // Don't call setReceiveInfo here as it would trigger another save
                visualStore.receiveInfo = receiveInfoFromFile
              } catch (error) {
                console.warn(error)
                console.log('missing stored receive info')
              }
            }

            const input = await processMatrixView(
              matrixView,
              this.host,
              validationResult.colorBy,
              (obj, id) => this.selectionHandler.set(obj, id)
            )
            this.updateViewer(input)
          } catch (error) {
            console.error('Data update error', error ?? 'Unknown')
          }
      }
    } catch (e) {
      console.warn('Input not valid:', (e as Error).message)
      this.host.displayWarningIcon(
        `Incomplete data input.`,
        `"Model Info" and "Application IDs" data inputs are mandatory. If your data connector does not output these columns, please update it to Speckle connector 4.x.`
      )
      visualStore.setFieldInputState({
        modelInfo: false,
        applicationIds: false,
        colorBy: false,
        tooltipData: false
      })
      return
    }
  }

  public getFormattingModel(): powerbi.visuals.FormattingModel {
    console.log('🎨 getFormattingModel called')
    const model = this.formattingSettingsService.buildFormattingModel(this.formattingSettings)
    return model
  }

  private updateViewer(input: SpeckleDataInput) {
    const visualStore = useVisualStore()

    this.tooltipHandler.setup(input.objectTooltipData)
    visualStore.setViewerReadyToLoad(true)

    if (visualStore.isViewerInitialized && !visualStore.viewerReloadNeeded) {
      visualStore.setDataInput(input)
    } else {
      // we should give some time to Vue to render ViewerWrapper component to be able to have proper emitter setup. Happiness level 6/10
      setTimeout(() => {
        visualStore.setDataInput(input)
      }, 250)
    }
  }

  public async destroy() {
    await this.clear()
  }
}
