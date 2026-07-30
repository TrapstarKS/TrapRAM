import { app } from 'electron'
import { join } from 'node:path'
import fs from 'node:fs'
import type { Settings } from '@shared/types'

const path = join(app.getPath('userData'), 'settings.json')

export const DEFAULTS: Settings = {
  theme: 'dark',
  accent: 'violet',
  multiInstance: false,
  killTrayProcesses: true,
  launchDelayMs: 3000,
  privacyMode: true,
  isolateProfiles: true,
  autoRefreshCookies: true,
  autoTile: false,
  anonymize: false,
  hideCookieActions: true,
  autoLockMinutes: 0,
  openAtLogin: false,
  presencePollSeconds: 45,
  confirmLaunch: false,
  sortMode: 'custom',
  extensionsDir: '',
  flagPresets: [],
  flagCustom: {},
  autoUpdate: true,
  compact: false,
  robloxPath: '',
  syncUrl: '',
  syncAuto: true,
  syncIntervalMin: 15,
  lastPlaceId: 0
}

let cache: Settings | null = null

export function get(): Settings {
  if (cache) return cache
  let loaded: Settings
  try {
    loaded = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(path, 'utf8')) }
  } catch {
    loaded = { ...DEFAULTS }
  }
  cache = loaded
  return loaded
}

export function set(patch: Partial<Settings>): Settings {
  const next: Settings = { ...get(), ...patch }
  cache = next
  const tmp = `${path}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, path)
  return next
}

export function windowState(): { width: number; height: number; x?: number; y?: number } {
  try {
    return JSON.parse(fs.readFileSync(join(app.getPath('userData'), 'window.json'), 'utf8'))
  } catch {
    return { width: 1180, height: 780 }
  }
}

export function saveWindowState(s: { width: number; height: number; x?: number; y?: number }): void {
  try {
    fs.writeFileSync(join(app.getPath('userData'), 'window.json'), JSON.stringify(s))
  } catch {}
}
