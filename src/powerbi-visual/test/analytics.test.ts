import assert from 'node:assert/strict'

import { buildReceiveEvent, trackReceive } from '../src/utils/analytics'

const deps = {
  visualVersion: '2026.10.1',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
}

const appReceiveInfo = {
  userId: 'user-1',
  userEmail: 'me@example.com',
  serverUrl: 'https://app.speckle.systems/',
  version: '2026.10.1'
}

const receiveProps = { sourceHostApp: 'revit', workspace_id: 'workspace-1', hostEnv: 4 }

// non-app servers never produce an event
assert.equal(
  buildReceiveEvent(
    { ...appReceiveInfo, serverUrl: 'https://latest.speckle.systems' },
    receiveProps,
    deps
  ),
  null
)

// no userId means no event, no email fallback
assert.equal(buildReceiveEvent({ ...appReceiveInfo, userId: undefined }, receiveProps, deps), null)

// no receive info at all
assert.equal(buildReceiveEvent(undefined, receiveProps, deps), null)

// full payload for app.speckle.systems
assert.deepEqual(buildReceiveEvent(appReceiveInfo, receiveProps, deps), {
  api_key: 'phc_7zaDwBgrBYb1yUe0Ff3Sn0DUibq0NoPNxYNC90M7cfg',
  event: 'Receive',
  distinct_id: 'user-1',
  properties: {
    $os: 'Windows',
    $lib: 'speckle-powerbi-visual',
    $lib_version: '2026.10.1',
    $user_id: 'user-1',
    $host: 'app.speckle.systems',
    hostAppSlug: 'powerbi',
    hostEnv: 'Desktop',
    connectorVersion: '2026.10.1',
    email: 'me@example.com',
    workspace_id: 'workspace-1',
    sourceHostApp: 'revit',
    actionSource: 'visual'
  }
})

// missing optional context becomes null rather than undefined
const sparse = buildReceiveEvent({ ...appReceiveInfo, version: undefined }, {}, deps)
assert.equal(sparse?.properties.hostEnv, null)
assert.equal(sparse?.properties.connectorVersion, null)
assert.equal(sparse?.properties.workspace_id, null)
assert.equal(sparse?.properties.sourceHostApp, null)

const run = async () => {
  // trackReceive posts the built event as JSON
  const calls: { url: string; init: RequestInit }[] = []
  const okFetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return { ok: true, status: 200, statusText: 'OK' } as Response
  }
  await trackReceive(appReceiveInfo, receiveProps, { ...deps, fetch: okFetch })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://eu.i.posthog.com/i/v0/e/')
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(calls[0].init.headers, { 'Content-Type': 'application/json' })
  assert.deepEqual(
    JSON.parse(calls[0].init.body as string),
    buildReceiveEvent(appReceiveInfo, receiveProps, deps)
  )

  // non-app servers never call fetch
  await trackReceive(
    { ...appReceiveInfo, serverUrl: 'https://latest.speckle.systems' },
    receiveProps,
    { ...deps, fetch: okFetch }
  )
  assert.equal(calls.length, 1)

  // network failures are swallowed
  const failingFetch = async () => {
    throw new Error('offline')
  }
  await trackReceive(appReceiveInfo, receiveProps, { ...deps, fetch: failingFetch })

  // non-2xx responses are swallowed too
  const rejectedFetch = async () =>
    ({ ok: false, status: 400, statusText: 'Bad Request' } as Response)
  await trackReceive(appReceiveInfo, receiveProps, { ...deps, fetch: rejectedFetch })

  console.log('analytics tests passed')
}

void run()
