import { app, BrowserWindow } from 'electron'
import pkg from 'electron-updater'
import type { UpdateState } from '@shared/types'

const { autoUpdater } = pkg

let state: UpdateState = { status: 'idle' }
let target: BrowserWindow | null = null

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

  autoUpdater.on('checking-for-update', () => push({ status: 'checking' }))
  autoUpdater.on('update-available', (i) =>
    push({ status: 'available', version: i.version, notes: typeof i.releaseNotes === 'string' ? i.releaseNotes : undefined })
  )
  autoUpdater.on('update-not-available', () => push({ status: 'none' }))
  autoUpdater.on('download-progress', (p) => push({ ...state, status: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => push({ status: 'ready', version: i.version }))
  autoUpdater.on('error', (e) => push({ status: 'error', error: e?.message ?? String(e) }))

  if (auto && app.isPackaged) {
    setTimeout(() => void check(), 4000)
    setInterval(() => void check(), 6 * 60 * 60 * 1000).unref()
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
  autoUpdater.quitAndInstall(false, true)
}
