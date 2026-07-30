import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cpus } from 'node:os'
import { systemPreferences, screen } from 'electron'
import { grid, parseEtime, claimOwners } from '@shared/pure'
import { isWin, owners, launches } from './launcher'

const run = promisify(execFile)

export interface RobloxProcess {
  pid: number
  memoryMb: number
  cpu: number
  uptimeSec: number
  priority: string
  background: boolean
  userId?: number
}

function ownerOf(key: string): number | undefined {
  return owners.get(key)
}

function fillOwners(list: RobloxProcess[]): RobloxProcess[] {
  return claimOwners(list, launches, Date.now())
}

const cpuSamples = new Map<number, { seconds: number; at: number }>()
const cores = Math.max(1, cpus().length)

function cpuPercent(pid: number, seconds: number, uptimeSec: number): number {
  const at = Date.now()
  const prev = cpuSamples.get(pid)
  cpuSamples.set(pid, { seconds, at })

  let used = seconds
  let over = uptimeSec
  if (prev && at > prev.at) {
    used = seconds - prev.seconds
    over = (at - prev.at) / 1000
  }
  if (over <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(((used / over) * 100) / cores * 10) / 10))
}

async function ps(script: string): Promise<string> {
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  })
  return stdout
}

interface WinProcess {
  pid: number
  mem: number
  cpu: number
  start: number
  prio: string
  cmd: string | null
}

export async function processes(): Promise<RobloxProcess[]> {
  if (isWin) {
    const out = await ps(
      "$cmd = @{}; Get-CimInstance Win32_Process -Filter 'Name=''RobloxPlayerBeta.exe''' -ErrorAction SilentlyContinue | " +
        'ForEach-Object { $cmd[[int]$_.ProcessId] = $_.CommandLine }; ' +
        'Get-Process -Name RobloxPlayerBeta -ErrorAction SilentlyContinue | ' +
        'ForEach-Object { [pscustomobject]@{ pid=$_.Id; mem=$_.WorkingSet64; cpu=$_.CPU; ' +
        'start=[int]((Get-Date) - $_.StartTime).TotalSeconds; prio=$_.PriorityClass.ToString(); ' +
        'cmd=$cmd[[int]$_.Id] } } | ConvertTo-Json -Compress'
    ).catch(() => '')
    if (!out.trim()) return []

    let list: WinProcess[]
    try {
      const parsed = JSON.parse(out)
      list = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      return []
    }

    const live = new Set(list.map((p) => p.pid))
    for (const pid of cpuSamples.keys()) if (!live.has(pid)) cpuSamples.delete(pid)

    return fillOwners(
      list.map((p) => {
        const cmd = p.cmd ?? ''
        const tracker = /(?:-b\s+|browsertrackerid:)(\d+)/i.exec(cmd)
        return {
          pid: p.pid,
          memoryMb: Math.round(p.mem / 1048576),
          cpu: cpuPercent(p.pid, p.cpu ?? 0, p.start ?? 0),
          uptimeSec: p.start ?? 0,
          priority: p.prio ?? 'Normal',
          background: cmd.includes('--launch-to-tray'),
          userId: tracker ? ownerOf(`b:${tracker[1]}`) : undefined
        }
      })
    )
  }

  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,rss=,time=,etime=,nice=,comm='], {
    maxBuffer: 16 * 1024 * 1024
  }).catch(() => ({ stdout: '' }))

  const out: RobloxProcess[] = []
  const live = new Set<number>()
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(-?\d+)\s+(.+)$/)
    if (!m) continue
    if (!/\/RobloxPlayer$/.test(m[6])) continue
    const pid = Number(m[1])
    const nice = Number(m[5])
    const uptimeSec = parseEtime(m[4])
    const slot = /\/instances\/slot-(\d+)\//.exec(m[6])
    live.add(pid)
    out.push({
      pid,
      memoryMb: Math.round(Number(m[2]) / 1024),
      cpu: cpuPercent(pid, parseEtime(m[3]), uptimeSec),
      uptimeSec,
      priority: nice < 0 ? 'High' : nice > 5 ? 'Low' : nice > 0 ? 'BelowNormal' : 'Normal',
      background: false,
      userId: slot ? ownerOf(`slot:${slot[1]}`) : ownerOf('app')
    })
  }
  for (const pid of cpuSamples.keys()) if (!live.has(pid)) cpuSamples.delete(pid)
  return fillOwners(out)
}

export async function killBackground(): Promise<number> {
  if (!isWin) return 0
  const targets = (await processes()).filter((p) => p.background).map((p) => p.pid)
  return targets.length ? kill(targets) : 0
}

export async function kill(pids: number[]): Promise<number> {
  let n = 0
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL')
      n++
    } catch {
      if (isWin) {
        await run('taskkill.exe', ['/F', '/PID', String(pid)], { windowsHide: true })
          .then(() => {
            n++
          })
          .catch(() => undefined)
      }
    }
  }
  return n
}

export async function killAll(): Promise<number> {
  return kill((await processes()).map((p) => p.pid))
}

const WIN_PRIORITY: Record<string, string> = {
  low: 'Idle',
  below: 'BelowNormal',
  normal: 'Normal',
  above: 'AboveNormal',
  high: 'High'
}
const NICE: Record<string, number> = { low: 15, below: 8, normal: 0, above: -5, high: -10 }

export async function setPriority(pids: number[], level: keyof typeof NICE): Promise<void> {
  if (!pids.length) return
  if (isWin) {
    const cls = WIN_PRIORITY[level] ?? 'Normal'
    await ps(
      `${pids.map((p) => `try { (Get-Process -Id ${p}).PriorityClass = '${cls}' } catch {}`).join('; ')}`
    )
    return
  }
  const nice = NICE[level] ?? 0

  await run('/usr/bin/renice', ['-n', String(nice), '-p', ...pids.map(String)]).catch(async () => {
    if (nice < 0) await run('/usr/bin/renice', ['-n', '0', '-p', ...pids.map(String)]).catch(() => undefined)
  })
}

export async function setAffinity(pids: number[], cores: number): Promise<void> {
  if (!isWin || !pids.length) return
  const total = cpus().length
  const n = Math.max(1, Math.min(cores || total, total))
  const mask = (1n << BigInt(n)) - 1n
  await ps(pids.map((p) => `try { (Get-Process -Id ${p}).ProcessorAffinity = [IntPtr]${mask} } catch {}`).join('; '))
}

export async function trimMemory(pids: number[]): Promise<number> {
  if (!isWin || !pids.length) return 0
  const out = await ps(
    `Add-Type -Name W -Namespace T -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool SetProcessWorkingSetSize(IntPtr h, IntPtr min, IntPtr max);' ; ` +
      `$n=0; ${pids
        .map(
          (p) =>
            `try { $h=(Get-Process -Id ${p}).Handle; if ([T.W]::SetProcessWorkingSetSize($h, [IntPtr]-1, [IntPtr]-1)) { $n++ } } catch {}`
        )
        .join(' ')} ; $n`
  ).catch(() => '0')
  return Number(out.trim()) || 0
}

let accessibilityAsked = false

export function accessibilityGranted(): boolean {
  if (isWin) return true
  return systemPreferences.isTrustedAccessibilityClient(false)
}

export function requestAccessibility(): boolean {
  if (isWin) return true
  if (systemPreferences.isTrustedAccessibilityClient(false)) return true
  if (accessibilityAsked) return false
  accessibilityAsked = true
  return systemPreferences.isTrustedAccessibilityClient(true)
}

export async function tileWindows(): Promise<{ tiled: number; needsPermission?: boolean }> {
  const procs = await processes()
  if (!procs.length) return { tiled: 0 }

  const area = screen.getPrimaryDisplay().workArea

  if (isWin) {
    const cells = grid(procs.length, area.width, area.height, area.x, area.y)
    const moves = procs
      .map((p, i) => {
        const c = cells[i]
        return `try { $h=(Get-Process -Id ${p.pid}).MainWindowHandle; if ($h -ne 0) { [T.U]::ShowWindow($h,9) | Out-Null; [T.U]::SetWindowPos($h,[IntPtr]::Zero,${c.x},${c.y},${c.w},${c.h},0x0004) | Out-Null } } catch {}`
      })
      .join(' ')
    await ps(
      `Add-Type -Name U -Namespace T -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);' ; ${moves}`
    )
    return { tiled: procs.length }
  }

  if (!systemPreferences.isTrustedAccessibilityClient(false)) return { tiled: 0, needsPermission: true }

  const cells = grid(procs.length, area.width, area.height, area.x, area.y)
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const one = [
      'tell application "System Events"',
      `  set procs to (every process whose unix id is ${procs[i].pid})`,
      '  if (count of procs) > 0 then',
      '    set p to item 1 of procs',
      '    if (count of windows of p) > 0 then',
      '      set w to window 1 of p',
      `      set position of w to {${c.x}, ${c.y}}`,
      `      set size of w to {${c.w}, ${c.h}}`,
      '    end if',
      '  end if',
      'end tell'
    ].join('\n')
    await run('/usr/bin/osascript', ['-e', one]).catch(() => undefined)
  }
  return { tiled: cells.length }
}
