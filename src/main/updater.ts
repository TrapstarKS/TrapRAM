import { app, BrowserWindow } from 'electron'
import pkg from 'electron-updater'
import type { UpdateState } from '@shared/types'

const { autoUpdater } = pkg

let state: UpdateState = { status: 'idle' }
let target: BrowserWindow | null = null
let attached = false
let initialCheckTimer: NodeJS.Timeout | null = null
let periodicCheckTimer: NodeJS.Timeout | null = null

function push(next: UpdateState): void {
  state = next
  if (target && !target.isDestroyed()) target.webContents.send('update:state', state)
}

export function currentUpdate(): UpdateState {
  return state
}

export function attach(win: BrowserWindow, auto: boolean): void {
  target = win
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  if (!attached) {
    const held = (): boolean => state.status === 'ready' || state.status === 'downloading'

    autoUpdater.on('checking-for-update', () => {
      if (!held()) push({ status: 'checking' })
    })
    autoUpdater.on('update-available', (i) => {
      if (held()) return
      push({
        status: 'available',
        version: i.version,
        notes: typeof i.releaseNotes === 'string' ? i.releaseNotes : undefined
      })
    })
    autoUpdater.on('update-not-available', () => {
      if (!held()) push({ status: 'none' })
    })
    autoUpdater.on('download-progress', (p) => push({ ...state, status: 'downloading', percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (i) => push({ status: 'ready', version: i.version }))
    autoUpdater.on('error', (e) => push({ status: 'error', error: e?.message ?? String(e) }))
    attached = true
  }

  win.once('closed', () => {
    if (target === win) target = null
  })

  configureAutomaticChecks(auto)
}

export function configureAutomaticChecks(auto: boolean): void {
  if (initialCheckTimer) clearTimeout(initialCheckTimer)
  if (periodicCheckTimer) clearInterval(periodicCheckTimer)
  initialCheckTimer = null
  periodicCheckTimer = null

  if (auto && app.isPackaged) {
    initialCheckTimer = setTimeout(() => void check(), 4000)
    initialCheckTimer.unref()
    periodicCheckTimer = setInterval(() => void check(), 6 * 60 * 60 * 1000)
    periodicCheckTimer.unref()
  }
}

export async function check(): Promise<UpdateState> {
  if (!app.isPackaged) {
    push({ status: 'none' })
    return state
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    push({ status: 'error', error: e instanceof Error ? e.message : String(e) })
  }
  return state
}

export async function download(): Promise<void> {
  push({ ...state, status: 'downloading', percent: 0 })
  try {
    await autoUpdater.downloadUpdate()
  } catch (e) {
    push({ status: 'error', error: e instanceof Error ? e.message : String(e) })
  }
}

export function install(): void {
  try {
    autoUpdater.quitAndInstall(true, true)
  } catch (e) {
    push({ status: 'error', error: e instanceof Error ? e.message : String(e) })
  }
}
