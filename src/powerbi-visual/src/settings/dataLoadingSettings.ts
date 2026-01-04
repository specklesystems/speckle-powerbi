import { formattingSettings as fs } from 'powerbi-visuals-utils-formattingmodel'

export class DataLoadingSettings extends fs.SimpleCard {
  name = 'dataLoading'
  displayName = 'Data Management'

  public internalizeData = new fs.ToggleSwitch({
    name: 'internalizeData',
    displayName: 'Internalize Data',
    description: 'When enabled, objects are downloaded and stored in the Power BI file for offline access. When disabled, objects are loaded directly from Speckle servers (online mode).',
    value: false
  })

  slices: fs.Slice[] = [this.internalizeData]
}