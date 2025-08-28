import { formattingSettings as fs } from 'powerbi-visuals-utils-formattingmodel'
import { ColorSettings } from 'src/settings/colorSettings'
import { CameraSettings } from 'src/settings/cameraSettings'
import { LightingSettings } from 'src/settings/lightingSettings'
import { DataLoadingSettings } from 'src/settings/dataLoadingSettings'

export class SpeckleVisualSettingsModel extends fs.Model {
  // Building my visual formatting settings card
  public color: ColorSettings = new ColorSettings()

  public dataLoading: DataLoadingSettings = new DataLoadingSettings()

  // public camera: CameraSettings = new CameraSettings()

  // public lighting: LightingSettings = new LightingSettings()

  cards = [this.color, this.dataLoading]
}
