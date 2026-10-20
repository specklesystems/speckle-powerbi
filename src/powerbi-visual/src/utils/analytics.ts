// Declared here as well as in globals.d.ts because the ts-node test harness only sees imported files
declare const __VISUAL_VERSION__: string

const POSTHOG_URL = 'https://eu.i.posthog.com/i/v0/e/'
const POSTHOG_API_KEY = 'phc_7zaDwBgrBYb1yUe0Ff3Sn0DUibq0NoPNxYNC90M7cfg'
const TRACKED_ORIGIN = 'https://app.speckle.systems'

// powerbi.common.CustomVisualHostEnv is a const enum, so the names are not available at runtime
const HOST_ENV_NAMES: Record<number, string> = {
  1: 'Web',
  2: 'PublishToWeb',
  4: 'Desktop',
  8: 'Embed',
  16: 'ReportServer',
  32: 'ExportReportHost',
  64: 'Mobile',
  128: 'DashboardHost'
}

export type ReceiveContext = {
  userId?: string
  userEmail: string
  serverUrl: string
  version?: string
}

export type ReceiveProperties = {
  sourceHostApp?: string
  workspace_id?: string
  hostEnv?: number
}

export type AnalyticsDeps = {
  fetch: (input: string, init: RequestInit) => Promise<Response>
  visualVersion: string
  userAgent: string
}

export function buildReceiveEvent(
  receiveInfo: ReceiveContext | undefined,
  props: ReceiveProperties,
  deps: Pick<AnalyticsDeps, 'visualVersion' | 'userAgent'>
) {
  if (!receiveInfo?.serverUrl) return null
  const server = new URL(receiveInfo.serverUrl)
  if (server.origin !== TRACKED_ORIGIN) return null
  // Older data connectors emit no userId; skip rather than fall back to email (ENG-10892)
  if (!receiveInfo.userId) return null

  return {
    api_key: POSTHOG_API_KEY,
    event: 'Receive',
    distinct_id: receiveInfo.userId,
    properties: {
      $os: detectOs(deps.userAgent),
      $lib: 'speckle-powerbi-visual',
      $lib_version: deps.visualVersion,
      $user_id: receiveInfo.userId,
      $host: server.host,
      hostAppSlug: 'powerbi',
      hostEnv:
        props.hostEnv === undefined ? null : HOST_ENV_NAMES[props.hostEnv] ?? String(props.hostEnv),
      connectorVersion: receiveInfo.version ?? null,
      email: receiveInfo.userEmail,
      workspace_id: props.workspace_id ?? null,
      sourceHostApp: props.sourceHostApp ?? null,
      actionSource: 'visual'
    }
  }
}

export async function trackReceive(
  receiveInfo: ReceiveContext | undefined,
  props: ReceiveProperties,
  deps?: AnalyticsDeps
) {
  try {
    const resolved: AnalyticsDeps = deps ?? {
      fetch: (input, init) => fetch(input, init),
      visualVersion: __VISUAL_VERSION__,
      userAgent: navigator.userAgent
    }
    const event = buildReceiveEvent(receiveInfo, props, resolved)
    if (!event) return

    const response = await resolved.fetch(POSTHOG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    })
    if (!response.ok) {
      throw new Error(`Analytics event failed: ${response.status} ${response.statusText}`)
    }
  } catch (error) {
    console.warn('Failed to track event in PostHog:', error)
  }
}

function detectOs(userAgent: string): string {
  if (/Windows/i.test(userAgent)) return 'Windows'
  if (/Mac/i.test(userAgent)) return 'Mac OS X'
  return 'unknown'
}
