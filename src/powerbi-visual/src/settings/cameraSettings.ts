import { formattingSettings as fs } from 'powerbi-visuals-utils-formattingmodel'

export class CameraSettings extends fs.Card {
  public defaultView: fs.SimpleSlice = new fs.AutoDropdown({
    name: 'defaultView',
    displayName: 'Default View',
    value: 'perspective'
  })

  public projection = new fs.AutoDropdown({
    name: 'projection',
    displayName: 'Projection',
    value: 'perspective'
  })

  public allowCameraUnder = new fs.ToggleSwitch({
    name: 'allowCameraUnder',
    displayName: 'Allow under model',
    value: false
  })

  public zoomOnDataChange = new fs.ToggleSwitch({
    name: 'zoomOnDataChange',
    displayName: 'Zoom extent on change',
    value: true
  })
  name = 'camera'
  displayName = 'Camera'
  slices: fs.Slice[] = [
    this.defaultView,
    this.projection,
    this.allowCameraUnder,
    this.zoomOnDataChange
  ]
}
