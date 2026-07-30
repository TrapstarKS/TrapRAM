import { shell, app } from 'electron'
import { join } from 'node:path'
import { homedir } from 'node:os'
import fs from 'node:fs/promises'
import type { LaunchTarget } from '@shared/types'
import { buildUri } from '@shared/pure'
import * as roblox from './roblox'

export const isWin = process.platform === 'win32'
export const isMac = process.platform === 'darwin'

export const owners = new Map<string, number>()
export const launches: { userId: number; at: number }[] = []

function remember(userId: number): void {
  const now = Date.now()
  launches.push({ userId, at: now })
  while (launches.length > 32 || (launches.length > 0 && now - launches[0].at > 1_800_000)) launches.shift()
  while (owners.size > 64) owners.delete(owners.keys().next().value as string)
}

export async function launch(
  cookie: string,
  target: LaunchTarget,
  multiInstance = false,
  userId = 0
): Promise<void> {
  const ticket = await roblox.authTicket(cookie)
  const tracker = Math.floor(Math.random() * 1e9)
  const uri = buildUri(ticket, target, tracker, Date.now())

  if (userId) {
    owners.set(`b:${tracker}`, userId)
    remember(userId)
  }

  if (isMac && multiInstance) {
    const macmulti = await import('./macmulti')
    const slot = await macmulti.launch(uri)
    if (userId) owners.set(`slot:${slot}`, userId)
    return
  }
  if (userId && isMac) owners.set('app', userId)
  await shell.openExternal(uri)
}

const cookieFiles = (): string[] =>
  isWin
    ? [join(process.env.LOCALAPPDATA ?? '', 'Roblox', 'LocalStorage', 'RobloxCookies.dat')]
    : [
        join(homedir(), 'Library', 'Roblox', 'LocalStorage', 'RobloxCookies.dat'),
        join(homedir(), 'Library', 'Application Support', 'Roblox', 'LocalStorage', 'RobloxCookies.dat')
      ]

export async function clearTrackingCookies(): Promise<number> {
  let cleared = 0
  for (const p of cookieFiles()) {
    try {
      await fs.writeFile(p, '')
      cleared++
    } catch {}
  }
  return cleared
}

let mutexHolder: ReturnType<typeof import('node:child_process').spawn> | null = null

const HOLDER = [
  "$m = New-Object System.Threading.Mutex($false, 'ROBLOX_singletonMutex')",
  'if ($m.WaitOne(0)) { Write-Output "HELD" } else { Write-Output "BUSY"; exit 1 }',
  '[Console]::Out.Flush()',
  'while ($true) { Start-Sleep -Seconds 3600 }'
].join('; ')

function stopHolder(): void {
  mutexHolder?.kill()
  mutexHolder = null
}

export async function setMultiInstance(on: boolean): Promise<boolean> {
  if (!isWin) return false
  if (!on) {
    stopHolder()
    return false
  }
  if (mutexHolder && !mutexHolder.killed) return true

  const { spawn } = await import('node:child_process')
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', HOLDER],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
  )

  return new Promise<boolean>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Timed out taking the Roblox single-client lock'))
    }, 15_000)

    const done = (err?: Error): void => {
      clearTimeout(timer)
      if (err) {
        child.kill()
        mutexHolder = null
        reject(err)
      } else {
        mutexHolder = child
        child.on('exit', () => {
          if (mutexHolder === child) mutexHolder = null
        })
        resolve(true)
      }
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      const out = chunk.toString()
      if (out.includes('HELD')) done()
      else if (out.includes('BUSY')) {
        done(
          new Error(
            'Roblox already holds the single-client lock — close every running client, then turn this back on'
          )
        )
      }
    })
    child.on('error', () => done(new Error('Could not start the helper that holds the single-client lock')))
    child.on('exit', (code) => {
      if (!mutexHolder) done(new Error(`The single-client lock helper exited (${code})`))
    })
  })
}

app.on('will-quit', () => {
  mutexHolder?.kill()
})

export async function versionDirs(): Promise<string[]> {
  if (isWin) {
    const base = join(process.env.LOCALAPPDATA ?? '', 'Roblox', 'Versions')
    try {
      const entries = await fs.readdir(base, { withFileTypes: true })
      const dirs: string[] = []
      for (const e of entries) {
        if (!e.isDirectory()) continue
        const p = join(base, e.name)
        try {
          await fs.access(join(p, 'RobloxPlayerBeta.exe'))
          dirs.push(p)
        } catch {}
      }
      return dirs
    } catch {
      return []
    }
  }
  const candidates = ['/Applications/Roblox.app/Contents/MacOS', join(homedir(), 'Applications/Roblox.app/Contents/MacOS')]
  const found: string[] = []
  for (const c of candidates) {
    try {
      await fs.access(c)
      found.push(c)
    } catch {}
  }
  return found
}

export async function isInstalled(): Promise<boolean> {
  return (await versionDirs()).length > 0
}

export async function readFastFlags(): Promise<Record<string, string | number | boolean>> {
  for (const dir of await versionDirs()) {
    try {
      return JSON.parse(await fs.readFile(join(dir, 'ClientSettings', 'ClientAppSettings.json'), 'utf8'))
    } catch {}
  }
  return {}
}

export async function writeFastFlags(flags: Record<string, string | number | boolean>): Promise<number> {
  const dirs = await versionDirs()
  if (!dirs.length) throw new Error('Roblox is not installed where TrapRAM can see it')
  let written = 0
  for (const dir of dirs) {
    const target = join(dir, 'ClientSettings')
    try {
      await fs.mkdir(target, { recursive: true })
      await fs.writeFile(join(target, 'ClientAppSettings.json'), JSON.stringify(flags, null, 2))
      written++
    } catch {}
  }
  if (!written) throw new Error('Could not write to any Roblox install folder')
  return written
}

export const FLAG_PRESETS: Record<string, { label: string; hint: string; flags: Record<string, string | number | boolean> }> = {
  clean: { label: 'Stock', hint: 'Remove every flag TrapRAM set', flags: {} },
  lowend: {
    label: 'Low-end',
    hint: 'Lowest quality, no shadows or post-processing',
    flags: {
      DFIntDebugFRMQualityLevelOverride: 1,
      FFlagDebugForceFutureIsBrightPhase3: false,
      FIntRenderShadowIntensity: 0,
      FFlagDisablePostFx: true,
      DFFlagTextureQualityOverrideEnabled: true,
      DFIntTextureQualityOverride: 0,
      FIntTerrainArraySliceSize: 4,
      FIntDebugForceMSAASamples: 0
    }
  },
  fps: {
    label: 'Unlocked FPS',
    hint: 'Raises the frame cap and trims render latency',
    flags: {
      DFIntTaskSchedulerTargetFps: 9999,
      FFlagTaskSchedulerLimitTargetFpsTo2402: false,
      FFlagGameBasicSettingsFramerateCap5: true,
      DFFlagDisableDPIScale: true
    }
  },
  quiet: {
    label: 'Quiet network',
    hint: 'Cuts telemetry and analytics traffic',
    flags: {
      FFlagDebugDisableTelemetryEphemeralCounter: true,
      FFlagDebugDisableTelemetryEphemeralStat: true,
      FFlagDebugDisableTelemetryEventIngest: true,
      FFlagDebugDisableTelemetryPoint: true,
      FFlagDebugDisableTelemetryV2Counter: true,
      FFlagDebugDisableTelemetryV2Event: true,
      FFlagDebugDisableTelemetryV2Stat: true
    }
  },
  lean: {
    label: 'Lean memory',
    hint: 'Smaller texture and streaming budgets',
    flags: {
      DFIntTextureQualityOverride: 1,
      DFFlagTextureQualityOverrideEnabled: true,
      DFIntCSGLevelOfDetailSwitchingDistance: 25,
      DFIntCSGLevelOfDetailSwitchingDistanceL12: 50,
      FIntTerrainArraySliceSize: 4,
      DFIntDefaultStreamingTargetRadius: 512
    }
  }
}

export async function ping(placeId: number): Promise<{ name: string; playing: number; icon?: string; universeId: number }> {
  const universeId = await roblox.universeOf(placeId)
  if (!universeId) throw new Error('That Place ID does not resolve to an experience')
  const info = await roblox.gameInfo(universeId)
  return { ...info, universeId }
}
