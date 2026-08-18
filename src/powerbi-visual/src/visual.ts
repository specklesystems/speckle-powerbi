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

// fetchMoreData paging budgets (windowed dataReductionAlgorithm, 30k/segment):
// with a real filter active, page until the full result is in so isolation is
// exact (456k-object categories on whale models); without filters, stop at the
// old 150k baseline — the unfiltered universe is never applied as a filter.
const FETCH_BASELINE_ROWS = 150000
const FETCH_FILTERED_MAX_ROWS = 1000000
/** Above this row count, filtered updates take the ids-only fast path (no per-row
 *  SelectionId builder / tooltips) — the builder alone froze the UI at 456k rows. */
const LIGHT_ROW_THRESHOLD = 30000

/** The one copy of the required-binding guidance — shown by the pre-flight
 *  recovery gate and the catch-all warning alike so the texts cannot drift. */
const BIND_GUIDANCE = `Load the "Models" and "Objects" tables from the Speckle connector (4.x), then bind Models[Model Info] to the "Model Info" field and Objects[object_key] (or Objects[Application ID]) to "Application IDs".`

/** Leaf-row count of the matrix (fast — no value parsing), for paging decisions. */
const countMatrixLeafRows = (matrix: powerbi.DataViewMatrix): number => {
  let count = 0
  const walk = (node: powerbi.DataViewMatrixNode): void => {
    const children = node.children
    if (!children || children.length === 0) {
      count++
      return
    }
    for (const child of children) walk(child)
  }
  const root = matrix.rows?.root
  if (root?.children) for (const child of root.children) walk(child)
  return count
}

/**
 * Cheap identity of a data update: row universe + highlight state. Persist-property
 * round-trips re-send IDENTICAL data every few seconds; without this memo each one
 * re-paged the same 150k rows through five fetch segments, forever. Highlight count
 * is included so a chart click on the same universe still registers as a change.
 */
const matrixSignature = (matrix: powerbi.DataViewMatrix, hasActiveFilters: boolean): string => {
  let rows = 0
  let highlighted = 0
  let firstId = ''
  let lastId = ''
  const walk = (node: powerbi.DataViewMatrixNode): void => {
    const children = node.children
    if (!children || children.length === 0) {
      rows++
      if (rows === 1) firstId = String(node.value ?? '')
      lastId = String(node.value ?? '')
      const values = node.values
      if (values) {
        for (const key of Object.keys(values)) {
          if (values[Number(key)]?.highlight != null) {
            highlighted++
            break
          }
        }
      }
      return
    }
    for (const child of children) walk(child)
  }
  const root = matrix.rows?.root
  if (root?.children) for (const child of root.children) walk(child)
  return `${hasActiveFilters}|${rows}|${highlighted}|${firstId}|${lastId}`
}

// noinspection JSUnusedGlobalSymbols
export class Visual implements IVisual {
  private readonly host: powerbi.extensibility.visual.IVisualHost
  private selectionHandler: SelectionHandler
  private tooltipHandler: TooltipHandler

  private formattingSettings: SpeckleVisualSettingsModel
  private formattingSettingsService: FormattingSettingsService
  /** True while fetchMoreData segments are accumulating (drives the row-count status). */
  private pagingActive = false
  /** Signature of the last fully-processed data update (see matrixSignature). */
  private lastSettledSignature = ''

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
      // Models[Model Info] travels as the matrix's top-level rows grouping —
      // one copy per update/segment instead of one per row (the per-row blob
      // repetition was the dominant term in the host's ~150k-row fetchMoreData
      // memory ceiling). The single-value dataview probe below is dormant
      // legacy plumbing (0464a5c: matrix+single crashes Desktop's
      // QueryGenerator — do not retry that mapping shape).
      const matrixDataView = options.dataViews.find((dv) => dv.matrix !== undefined)
      const matrixView = matrixDataView?.matrix
      if (!matrixView) throw new Error('Data does not contain a matrix data view') // TODO: Could be toast notificiation too!
      const singleDataView = options.dataViews.find((dv) => dv.single !== undefined)
      const modelInfoBlob = (singleDataView?.single?.value as string) ?? null

      // we first need to check which inputs user provided to decide our strategy
      const validationResult = validateMatrixView(options)
      visualStore.setFieldInputState(validationResult)
      console.log('❓Field inputs', validationResult)

      // the viewer only re-measures on window resize, which the sandbox does
      // not reliably fire — forward host resize updates to the viewer handler
      if (options.type & (UpdateType.Resize | UpdateType.ResizeEnd)) {
        visualStore.viewerEmit?.('resize')
      }

      // only react to Data updates; resize/style/viewmode-only updates are no-ops
      if (!(options.type & UpdateType.Data)) {
        return
      }

      // precise recovery guidance: rendering needs the Models payload grouping
      // plus an object identifier — name the exact table and field to bind.
      // Placed below the resize/Data gates so an unbound field never blocks
      // resize forwarding or fires host warnings on non-data updates.
      if (!validationResult.modelInfo || !validationResult.applicationIds) {
        if (this.pagingActive) {
          this.pagingActive = false
          visualStore.clearLoadingProgress()
        }
        // the leaf-based signature does not see the grouping level, so an
        // unbind/rebind of Model Info would otherwise memo-skip the re-render
        this.lastSettledSignature = ''
        this.host.displayWarningIcon(`Missing required fields.`, BIND_GUIDANCE)
        return
      }

      // Segmented-paging fast path: while more segments exist and the budget
      // allows, accumulate WITHOUT reprocessing the matrix — re-parsing the whole
      // accumulated view on each 30k segment made paging quadratic (a 456k-row
      // filter re-walked millions of rows). One full process runs once paging
      // settles (final segment, budget hit, or host refusal).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasActiveFilters = (((options as any).jsonFilters as unknown[]) ?? []).length > 0

      // Identical-update memo: persist-property round-trips re-send the same data
      // every few seconds — don't re-page/re-process what we already settled.
      const signature = matrixSignature(matrixView, hasActiveFilters)
      if (signature === this.lastSettledSignature) {
        return
      }

      // Page to the FULL universe (budgeted): chart-interaction filters never
      // appear in jsonFilters, but the dictionary knows the model's true object
      // count — if the paged universe ENDS below it, the data WAS filtered.
      // The identical-update memo above makes this probe once-per-real-change.
      const segment = matrixDataView?.metadata?.segment
      if (segment) {
        const rowCount = countMatrixLeafRows(matrixView)
        if (rowCount >= FETCH_FILTERED_MAX_ROWS) {
          visualStore.pushDiagEvent(
            `row universe exceeds the ${FETCH_FILTERED_MAX_ROWS}-row budget — treating as unfiltered`
          )
        } else if (this.host.fetchMoreData(true)) {
          this.pagingActive = true
          visualStore.setLoadingProgress(
            `Loading data — ${Math.round(rowCount / 1000)}k rows`,
            null
          )
          return
        } else {
          // the HOST refused more segments (its own memory ceiling — ~150k rows
          // for fat rows: GUID strings + the repeated Model Info blob). Universe
          // stays incomplete → treated as unfiltered/sampled downstream.
          visualStore.pushDiagEvent(
            `host refused more data at ${rowCount} rows (fetchMoreData memory ceiling) — universe incomplete`
          )
        }
      }
      if (this.pagingActive) {
        this.pagingActive = false
        visualStore.pushDiagEvent(`data paging settled — ${countMatrixLeafRows(matrixView)} rows`)
        visualStore.clearLoadingProgress()
      }
      this.lastSettledSignature = signature
      // universe is COMPLETE when no segment remains — the discriminator the
      // store uses (alongside jsonFilters) to decide filtered vs sampled
      const universeComplete = !segment
      {
          try {
            // read saved settings from file if any
            console.log('🔍 Checking for other saved settings:')

            if (!visualStore.isViewerObjectsLoaded && matrixDataView.metadata.objects) {
              const defaultViewMode = matrixDataView.metadata.objects.viewMode?.defaultViewMode
              if (defaultViewMode) {
                console.log(`Default View Mode: ${defaultViewMode as string}`)

                visualStore.setDefaultViewModeInFile(defaultViewMode as string)
              }

              const brandingHidden = matrixDataView.metadata.objects.workspace?.brandingHidden
              if (brandingHidden !== undefined) {
                console.log(`Branding Hidden: ${brandingHidden as boolean}`)

                visualStore.setBrandingHidden(brandingHidden as boolean)
              }

              const navbarHidden = matrixDataView.metadata.objects.viewMode?.navbarHidden
              if (navbarHidden !== undefined) {
                console.log(`Navbar Hidden: ${navbarHidden as boolean}`)

                visualStore.setNavbarHidden(navbarHidden as boolean)
              }

              // Load edges settings
              const viewModeSettings = matrixDataView.metadata.objects.viewMode
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

              const cameraPositionData = matrixDataView.metadata.objects.cameraPosition
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

              const sectionBoxData = matrixDataView.metadata.objects.sectionBox?.boxData
              if (sectionBoxData) {
                console.log('Stored section box is found')
                visualStore.setSectionBoxData(sectionBoxData as string)
              }

              const camera = matrixDataView.metadata.objects.camera

              if (camera && 'isOrtho' in camera) {
                console.log(
                  `Projection is ortho?: ${
                    matrixDataView.metadata.objects.camera?.isOrtho as boolean
                  }`
                )

                visualStore.setIsOrthoProjection(
                  matrixDataView.metadata.objects.camera?.isOrtho as boolean
                )
              }

              if (camera && 'isGhost' in camera) {
                console.log(
                  `Is ghost?: ${matrixDataView.metadata.objects.camera?.isGhost as boolean}`
                )

                visualStore.setIsGhost(
                  matrixDataView.metadata.objects.camera?.isGhost as boolean
                )
              }

              if (camera && 'zoomOnFilter' in camera) {
                console.log(
                  `Zoom on filter?: ${
                    matrixDataView.metadata.objects.camera?.zoomOnFilter as boolean
                  }`
                )

                visualStore.setIsZoomOnFilterActive(
                  matrixDataView.metadata.objects.camera?.zoomOnFilter as boolean
                )
              }

              // get receive info from file for persistence
              try {
                const receiveInfoFromFile = JSON.parse(
                  matrixDataView.metadata.objects.storedData?.receiveInfo as string
                ) as ReceiveInfo
                // Don't call setReceiveInfo here as it would trigger another save
                visualStore.receiveInfo = receiveInfoFromFile
              } catch (error) {
                console.warn(error)
                console.log('missing stored receive info')
              }
            }

            const lightweightRows =
              hasActiveFilters && countMatrixLeafRows(matrixView) > LIGHT_ROW_THRESHOLD
            if (lightweightRows) {
              visualStore.pushDiagEvent(
                'big filtered set — ids-only fast path (no per-row selection ids/tooltips)'
              )
            }
            const input = await processMatrixView(
              matrixView,
              this.host,
              validationResult.colorBy,
              (obj, id) => this.selectionHandler.set(obj, id),
              lightweightRows,
              modelInfoBlob
            )
            // jsonFilters = the filters PBI actually applied to this visual
            // (slicers / filter pane / filter-mode interactions). Without any,
            // objectIds is just the row-capped sample of the model and must not
            // be applied as a viewer filter (hides most of a whale model).
            input.hasActiveFilters = hasActiveFilters
            input.universeComplete = universeComplete
            this.updateViewer(input)
          } catch (error) {
            console.error('Data update error', error ?? 'Unknown')
          }
      }
    } catch (e) {
      console.warn('Input not valid:', (e as Error).message)
      this.host.displayWarningIcon(
        `Incomplete data input.`,
        `"Model Info" and "Application IDs" data inputs are mandatory. ${BIND_GUIDANCE}`
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
