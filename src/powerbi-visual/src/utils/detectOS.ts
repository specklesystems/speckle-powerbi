// Add data types to window.navigator for use in this file. See https://www.typescriptlang.org/docs/handbook/triple-slash-directives.html#-reference-types- for more info.
/// <reference types="user-agent-data-types" />
export function getOS(): OS {
  const platform = window.navigator?.userAgentData?.platform || window.navigator.platform,
    macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K', 'macOS'],
    windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE']
  let os = null
  if (macosPlatforms.indexOf(platform) !== -1) {
    os = 'MacOS'
  } else if (windowsPlatforms.indexOf(platform) !== -1) {
    os = 'Windows'
  } else if (/Linux/.test(platform)) {
    os = 'Linux'
  }
  return os
}

export enum OS {
  Windows,
  MacOS,
  Linux
}

export const currentOS = getOS()
