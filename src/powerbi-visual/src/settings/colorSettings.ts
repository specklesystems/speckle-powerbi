import { formattingSettings as fs } from 'powerbi-visuals-utils-formattingmodel'
import {
  createDataViewWildcardSelector,
  DataViewWildcardMatchingOption
} from 'powerbi-visuals-utils-dataviewutils/lib/dataViewWildcard'
import VisualEnumerationInstanceKinds = powerbi.VisualEnumerationInstanceKinds

export enum ContextOption {
  hidden = 'hidden',
  ghosted = 'ghosted',
  show = 'show'
}
export class ColorSettings extends fs.Card {
  public enabled = new fs.ToggleSwitch({
    name: 'enabled',
    displayName: 'Enabled',
    value: true,
    topLevelToggle: true
  })

  public fill = new fs.ColorPicker({
    name: 'fill',
    displayName: 'Color override',
    description:
      'Allows to override the colors of each object based on user-defined rules. Default color does not affect visualization.',
    value: { value: '#c5c5c5' },
    defaultColor: { value: '#c5c5c5' },
    selector: createDataViewWildcardSelector(DataViewWildcardMatchingOption.InstancesAndTotals),
    altConstantSelector: {
      static: {}
    },
    instanceKind: VisualEnumerationInstanceKinds.ConstantOrRule
  })

  public context = new fs.AutoDropdown({
    name: 'context',
    displayName: 'Context display',
    description: 'Determines how to display objects not present in the input data table.',
    value: ContextOption.ghosted
  })

  name = 'color'
  displayName = 'Object Display'
  slices: fs.Slice[] = [this.context, this.fill]
}

export class ColorSelectorSettings extends fs.Card {
  name = 'colorSelector'
  displayName = 'Color Selector'
  slices = []
}
