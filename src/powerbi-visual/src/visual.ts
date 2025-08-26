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
import { unzipModelObjects } from './utils/compression'

import TooltipHandler from './handlers/tooltipHandler'
import SelectionHandler from './handlers/selectionHandler'

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions
import IVisual = powerbi.extensibility.visual.IVisual
import ITooltipService = powerbi.extensibility.ITooltipService

import { pinia } from './plugins/pinia'
import { useVisualStore } from './store/visualStore'

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
    // Tracker.loaded()
    this.host = options.host
    this.formattingSettingsService = new FormattingSettingsService()

    console.log('🚀 Init handlers')
    this.selectionHandler = new SelectionHandler(this.host)
    this.tooltipHandler = new TooltipHandler(this.host.tooltipService as ITooltipService)

    console.log('🚀 Init Vue App')
    createApp(App)
      .use(pinia)
      .use(VueTippy, {
        defaultProps: {
          theme: 'custom'
        }
      })
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

    // @ts-ignore
    console.log('⤴️ Update type 👉', powerbi.VisualUpdateType[options.type])

    this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
      SpeckleVisualSettingsModel,
      options.dataViews[0]
    )

    visualStore.setFormattingSettings(this.formattingSettings)
    console.log('Selector colors', this.formattingSettings.colorSelector)
    console.log(
      'Data Loading - Internalize Data:',
      this.formattingSettings.dataLoading.internalizeData.value
    )

    // Handle toggle state changes
    const currentToggleState = this.formattingSettings.dataLoading.internalizeData.value
    const previousToggleState = visualStore.previousToggleState

    // Detect user toggle changes
    if (previousToggleState !== undefined && currentToggleState !== previousToggleState) {
      console.log('🔄 User changed toggle from', previousToggleState, 'to', currentToggleState)

      if (currentToggleState) {
        // Toggle switched ON - internalize via streaming
        if (visualStore.isViewerObjectsLoaded && visualStore.lastLoadedRootObjectId) {
          console.log('📁 Toggle ON - starting internalization')
          await this.internalizeCurrentViewerData()
        } else {
          console.log('📁 Toggle ON - no active session to internalize')
        }
      } else {
        // Toggle switched OFF - remove internalized data
        console.log('🗑️ Toggle OFF - removing internalized data')
        this.removeInternalizedData()
      }
    }

    // CRITICAL: Always update the previous state for next comparison
    visualStore.setPreviousToggleState(currentToggleState)

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
            // read saved settings from file if any
            console.log('🔍 Checking for other saved settings:')

            if (!visualStore.isViewerObjectsLoaded && options.dataViews[0].metadata.objects) {
              if (options.dataViews[0].metadata.objects.viewMode?.defaultViewMode as string) {
                console.log(
                  `Default View Mode: ${
                    options.dataViews[0].metadata.objects.viewMode?.defaultViewMode as string
                  }`
                )

                visualStore.setDefaultViewModeInFile(
                  options.dataViews[0].metadata.objects.viewMode?.defaultViewMode as string
                )
              }

              if (options.dataViews[0].metadata.objects.workspace?.brandingHidden as boolean) {
                console.log(
                  `Branding Hidden: ${
                    options.dataViews[0].metadata.objects.workspace?.brandingHidden as boolean
                  }`
                )

                visualStore.setBrandingHidden(
                  options.dataViews[0].metadata.objects.workspace?.brandingHidden as boolean
                )
              }

              if (options.dataViews[0].metadata.objects.viewMode?.navbarHidden as boolean) {
                console.log(
                  `Navbar Hidden: ${
                    options.dataViews[0].metadata.objects.viewMode?.navbarHidden as boolean
                  }`
                )

                visualStore.setNavbarHidden(
                  options.dataViews[0].metadata.objects.viewMode?.navbarHidden as boolean
                )
              }

              if (options.dataViews[0].metadata.objects.cameraPosition?.positionX as string) {
                console.log(`Stored camera position is found`)
                visualStore.setCameraPositionInFile([
                  Number(options.dataViews[0].metadata.objects.cameraPosition?.positionX),
                  Number(options.dataViews[0].metadata.objects.cameraPosition?.positionY),
                  Number(options.dataViews[0].metadata.objects.cameraPosition?.positionZ),
                  Number(options.dataViews[0].metadata.objects.cameraPosition?.targetX),
                  Number(options.dataViews[0].metadata.objects.cameraPosition?.targetY),
                  Number(options.dataViews[0].metadata.objects.cameraPosition?.targetZ)
                ])
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

              // Log persisted data loading setting but don't force sync
              if (
                options.dataViews[0].metadata.objects.dataLoading?.internalizeData !== undefined
              ) {
                console.log(
                  `Stored Data Loading - Internalize Data: ${
                    options.dataViews[0].metadata.objects.dataLoading?.internalizeData as boolean
                  }`
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

            // Check for internalized data
            const internalizedData = options.dataViews[0].metadata.objects?.storedData
              ?.speckleObjects as string

            const input = await processMatrixView(
              matrixView,
              this.host,
              validationResult.colorBy,
              this.formattingSettings,
              (obj, id) => this.selectionHandler.set(obj, id),
              internalizedData
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
    console.log('🎨 getFormattingModel called')

    // build the cards for the options
    const model: powerbi.visuals.FormattingModel = {
      cards: [
        // Color card
        {
          displayName: 'Object Display',
          name: 'color',
          uid: 'color_card_uid',
          groups: [
            {
              displayName: undefined,
              uid: 'color_group_uid',
              slices: [
                {
                  displayName: 'Enabled',
                  uid: 'color_enabled_uid',
                  control: {
                    type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                    properties: {
                      descriptor: {
                        objectName: 'color',
                        propertyName: 'enabled'
                      },
                      value: this.formattingSettings.color.enabled.value
                    }
                  }
                }
              ]
            }
          ]
        },
        // Data Management card
        {
          displayName: 'Data Management',
          name: 'dataLoading',
          uid: 'dataLoading_card_uid',
          groups: [
            {
              displayName: undefined,
              uid: 'dataLoading_group_uid',
              slices: [
                {
                  displayName: 'Internalize Data',
                  uid: 'dataLoading_internalizeData_uid',
                  control: {
                    type: powerbi.visuals.FormattingComponent.ToggleSwitch,
                    properties: {
                      descriptor: {
                        objectName: 'dataLoading',
                        propertyName: 'internalizeData'
                      },
                      value: this.formattingSettings.dataLoading.internalizeData.value
                    }
                  }
                }
              ]
            }
          ]
        }
      ]
    }

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

  private tryReadFromFile(objectsFromFile: object[][], visualStore) {
    visualStore.setViewerReadyToLoad(true)
    visualStore.setIsLoadingFromFile(true)
    setTimeout(() => {
      visualStore.loadObjectsFromFile(objectsFromFile)
      this.isFirstViewerLoad = false
    }, 250)
    console.log(`${objectsFromFile.length} objects retrieved from persistent properties!`)
  }

  private async internalizeCurrentViewerData() {
    const visualStore = useVisualStore()

    // Get the current root object ID from the last loaded data
    if (!visualStore.lastLoadedRootObjectId) {
      console.log('📁 No root object ID to internalize')
      return
    }

    try {
      console.log('📁 Starting internalization via desktop service streaming...')

      visualStore.setLoadingProgress('📦 Internalizing data...', null)

      // Use desktop service  for internalization
      // TBD: getting objects from viewer caused two issue:
      // - Data format -> we need to make an extra operation to match with the offline loader
      // - Memory -> need to save data two times so sometimes causes memory issues
      const rootObjectId = visualStore.lastLoadedRootObjectId
      const response = await fetch(`http://localhost:29364/get-objects/${rootObjectId}`)

      if (!response.body) {
        console.error('📁 No response body from desktop service')
        visualStore.clearLoadingProgress()
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let allObjectsData = ''

      console.log('📁 Streaming objects from desktop service...')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        allObjectsData += decoder.decode(value, { stream: true })
      }

      // Parse NDJSON (newline-delimited JSON) format
      const lines = allObjectsData.trim().split('\n')
      const streamedObjects = lines.map((line) => JSON.parse(line))
      console.log(`📁 Streamed ${streamedObjects.length} objects from desktop service`)

      // Clean up objects to reduce file size (same as desktop service does)
      const cleanedObjects = streamedObjects.map((obj: any, index: number) => {
        // Skip first object (root), clean others
        if (index === 0) return obj

        const cleanedObj = { ...obj }

        // Remove unnecessary properties
        if (cleanedObj.speckle_type?.includes('Objects.Data.DataObject')) {
          delete cleanedObj.properties
        }
        delete cleanedObj.__closure

        return cleanedObj
      })

      console.log(`📁 Cleaned objects: ${cleanedObjects.length} total`)

      // Wrap in array format expected by viewer (object[][])
      const modelObjectsArray = [cleanedObjects]

      // Use existing writeObjectsToFile method from visualStore
      visualStore.writeObjectsToFile(modelObjectsArray)

      // Clear loading message immediately when done
      visualStore.clearLoadingProgress()

      console.log('📁 Successfully internalized data via desktop service!')
    } catch (error) {
      console.error('📁 Failed to internalize via desktop service:', error)

      // Clear loading message immediately on error
      visualStore.clearLoadingProgress()
    }
  }

  private removeInternalizedData() {
    const visualStore = useVisualStore()

    try {
      // Clear stored data from PowerBI file
      this.host.persistProperties({
        merge: [
          {
            objectName: 'storedData',
            properties: {
              speckleObjects: null,
              receiveInfo: null
            },
            selector: null
          }
        ]
      })

      console.log('🗑️ Successfully removed internalized data from file!')
    } catch (error) {
      console.error('🗑️ Failed to remove internalized data:', error)
    }
  }

  public async destroy() {
    await this.clear()
  }
}
