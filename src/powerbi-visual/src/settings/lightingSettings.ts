import { formattingSettings as fs } from 'powerbi-visuals-utils-formattingmodel'
import ValidatorType = powerbi.visuals.ValidatorType
import { SunLightConfiguration } from '@speckle/viewer'

export class LightingSettings extends fs.Card {
  name = 'lighting'
  displayName = 'Lighting'

  public enabled = new fs.ToggleSwitch({
    name: 'enabled',
    displayName: 'Enabled',
    value: true,
    topLevelToggle: true
  })

  public intensity = new fs.Slider({
    name: 'intensity',
    displayName: 'Intensity',
    options: {
      minValue: { type: ValidatorType.Min, value: 1 },
      maxValue: { type: ValidatorType.Max, value: 10 }
    },
    value: 5
  })
  public elevation = new fs.Slider({
    name: 'elevation',
    displayName: 'Elevation',
    options: {
      minValue: { type: ValidatorType.Min, value: 0 },
      maxValue: { type: ValidatorType.Max, value: Math.PI }
    },
    value: 1.33
  })
  public azimuth = new fs.Slider({
    name: 'azimuth',
    displayName: 'azimuth',
    options: {
      minValue: { type: ValidatorType.Min, value: -Math.PI * 0.5 },
      maxValue: { type: ValidatorType.Max, value: Math.PI * 0.5 }
    },
    value: 0.75
  })
  public indirect = new fs.Slider({
    name: 'indirect',
    displayName: 'indirect',
    options: {
      minValue: { type: ValidatorType.Min, value: 0.0 },
      maxValue: { type: ValidatorType.Max, value: 5.0 }
    },
    value: 1.2
  })

  public shadows = new fs.ToggleSwitch({
    name: 'shadows',
    displayName: 'Cast shadows',
    value: true
  })

  public shadowCatcher = new fs.ToggleSwitch({
    name: 'shadowCatcher',
    displayName: 'Catch Shadows',
    value: true
  })

  slices: fs.Slice[] = [
    this.intensity,
    this.elevation,
    this.azimuth,
    this.indirect,
    this.shadows,
    this.shadowCatcher
  ]

  public getViewerConfiguration(): SunLightConfiguration {
    return {
      enabled: this.enabled.value,
      castShadow: this.shadows.value,
      intensity: this.intensity.value,
      elevation: this.elevation.value,
      azimuth: this.azimuth.value,
      indirectLightIntensity: this.intensity.value,
      shadowcatcher: this.shadowCatcher.value
    }
  }
}
