// TBD NOTE: if we decide to tackle certification on visual and deploy it on microsoft marketplace, we would need to remove this logic
// since we enable webaccess privile for the sake of mixpanel for now.

import { useVisualStore } from '@src/store/visualStore'
import { md5 } from './md5'

const TRACK_URL = 'https://analytics.speckle.systems/track?ip=1'
const MIXPANEL_TOKEN = 'acd87c5a50b56df91a795e999812a3a4'
const HOST_APP_NAME = 'powerbi-visual'
const IS_OFFLINE_SUPPORT = true

export enum SettingsChangedType {
  Gradient = 'Gradient',
  DefaultCamera = 'DefaultCamera',
  OrthoMode = 'OrthoMode'
}

export class Tracker {
  public static async track(event: string, properties: any = {}) {
    const visualStore = useVisualStore()
    const receiveInfo = visualStore.receiveInfo
    let tempProperties = properties
    if (receiveInfo) {
      const hashedEmail = '@' + md5(receiveInfo.userEmail.toLowerCase() as string).toUpperCase()
      const hashedServer = md5(
        new URL(receiveInfo.serverUrl).hostname.toLowerCase() as string
      ).toUpperCase()
      tempProperties = {
        ...tempProperties, // eslint-disable-next-line camelcase
        distinct_id: hashedEmail,
        // eslint-disable-next-line camelcase
        server_id: hashedServer
      }
    }

    return this.trackEvents([
      {
        event,
        properties: tempProperties
      }
    ])
  }

  private static async trackEvents(events: Array<{ event: string; properties: any }>) {
    try {
      await fetch(TRACK_URL, {
        method: 'POST',
        body:
          'data=' +
          JSON.stringify(
            events.map((e) => {
              Object.assign(e.properties, {
                token: MIXPANEL_TOKEN,
                hostApp: HOST_APP_NAME,
                offlineSupport: IS_OFFLINE_SUPPORT,
                ui: 'dui3',
                type: 'action'
              })
              return e
            })
          )
      })
    } catch (e) {
      console.error('Create track failed', e)
    }
  }

  public static dataLoaded(properties = {}) {
    return this.track('Receive', properties)
  }
}
