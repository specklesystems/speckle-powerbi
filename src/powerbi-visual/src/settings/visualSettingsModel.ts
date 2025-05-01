import { formattingSettings as fs } from 'powerbi-visuals-utils-formattingmodel'
import { ColorSelectorSettings, ColorSettings } from 'src/settings/colorSettings'
export class SpeckleVisualSettingsModel extends fs.Model {
  // Building my visual formatting settings card
  public color: ColorSettings = new ColorSettings()

  public colorSelector: ColorSelectorSettings = new ColorSelectorSettings()

  cards = [this.color]
}
