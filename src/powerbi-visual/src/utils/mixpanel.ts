const TRACK_URL = 'https://analytics.speckle.systems/track?ip=1'
const MIXPANEL_TOKEN = 'acd87c5a50b56df91a795e999812a3a4'
const HOST_APP_NAME = 'powerbi-visual'

export enum Event {
  Create = 'Create',
  Reload = 'Reload',
  Settings = 'Settings'
}

export enum SettingsChangedType {
  Gradient = 'Gradient',
  DefaultCamera = 'DefaultCamera',
  OrthoMode = 'OrthoMode'
}

export class Tracker {
  public static async track(event: Event, properties: any = {}) {
    return this.trackEvents([
      {
        event,
        properties
      }
    ])
  }

  private static async trackEvents(events: Array<{ event: Event; properties: any }>) {
    try {
      await fetch(TRACK_URL, {
        method: 'POST',
        body:
          'data=' +
          JSON.stringify(
            events.map((e) => {
              Object.assign(e.properties, {
                token: MIXPANEL_TOKEN,
                hostApp: HOST_APP_NAME
              })
              return e
            })
          )
      })
    } catch (e) {
      console.error('Create track failed', e)
    }
  }

  public static loaded() {
    return this.track(Event.Create)
  }

  public static dataReload() {
    return this.track(Event.Reload)
  }

  public static settingsChanged(type: SettingsChangedType) {
    return this.track(Event.Settings, { type })
  }
}
