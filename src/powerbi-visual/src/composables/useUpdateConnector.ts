import { useVisualStore } from '@src/store/visualStore'
import { ref } from 'vue'

type Versions = {
  Versions: Version[]
}

export type Version = {
  Number: string
  Url: string
  Os: number
  Architecture: number
  Date: string
  Prerelease: boolean
}

export function useUpdateConnector() {
  const versions = ref<Version[]>([])
  const latestAvailableVersion = ref<Version | null>(null)

  async function checkUpdate() {
    try {
      await getVersions()
    } catch (e) {
      console.error(e)
    }
  }

  async function getVersions() {
    const visualStore = useVisualStore()
    const response = await fetch(`https://releases.speckle.dev/manager2/feeds/powerbi-v3.json`, {
      method: 'GET'
    })

    if (!response.ok) {
      throw new Error('Failed to fetch versions')
    }

    const data = (await response.json()) as unknown as Versions
    const sortedVersions = data.Versions.sort(function (a: Version, b: Version) {
      return new Date(b.Date).getTime() - new Date(a.Date).getTime()
    })
    versions.value = sortedVersions
    const sanitizedVersion = sanitizeVersion(sortedVersions[0].Number)
    latestAvailableVersion.value = { ...sortedVersions[0], Number: sanitizedVersion }
    visualStore.setLatestAvailableVersion(latestAvailableVersion.value)
  }

  function sanitizeVersion(version: string): string {
    const match = version.match(/\d+\.\d+\.\d+/)
    return match ? match[0] : version // fallback to original version
  }

  return { checkUpdate }
}
