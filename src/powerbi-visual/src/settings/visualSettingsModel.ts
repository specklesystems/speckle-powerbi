import { formattingSettings as fs } from 'powerbi-visuals-utils-formattingmodel'
import { ColorSelectorSettings, ColorSettings } from './colorSettings'
import { CameraSettings } from './cameraSettings'
import { LightingSettings } from './lightingSettings'

export class SpeckleVisualSettingsModel extends fs.Model {
  // Building my visual formatting settings card
  public color: ColorSettings = new ColorSettings()

  public colorSelector: ColorSelectorSettings = new ColorSelectorSettings()

  public camera: CameraSettings = new CameraSettings()

  public lighting: LightingSettings = new LightingSettings()

  cards = [this.color, this.camera, this.lighting]
}
