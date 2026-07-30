import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cpus } from 'node:os'
import { systemPreferences, screen } from 'electron'
import { grid, parseEtime } from '@shared/pure'
import { isWin } from './launcher'

const run = promisify(execFile)

export interface RobloxProcess {
  pid: number
  memoryMb: number
  cpu: number
  uptimeSec: number
  priority: string
}

async function ps(script: string): Promise<string> {
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  })
  return stdout
}

export async function processes(): Promise<RobloxProcess[]> {
  if (isWin) {
    const out = await ps(
      "Get-Process -Name RobloxPlayerBeta -ErrorAction SilentlyContinue | " +
        'ForEach-Object { [pscustomobject]@{ pid=$_.Id; mem=$_.WorkingSet64; cpu=$_.CPU; ' +
        'start=[int]((Get-Date) - $_.StartTime).TotalSeconds; prio=$_.PriorityClass.ToString() } } | ConvertTo-Json -Compress'
    ).catch(() => '')
    if (!out.trim()) return []
    const parsed = JSON.parse(out)
    const list = Array.isArray(parsed) ? parsed : [parsed]
    return list.map((p: { pid: number; mem: number; cpu: number; start: number; prio: string }) => ({
      pid: p.pid,
      memoryMb: Math.round(p.mem / 1048576),
      cpu: Math.round((p.cpu ?? 0) * 10) / 10,
      uptimeSec: p.start ?? 0,
      priority: p.prio ?? 'Normal'
    }))
  }

  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,rss=,%cpu=,etime=,nice=,comm='], {
    maxBuffer: 16 * 1024 * 1024
  }).catch(() => ({ stdout: '' }))

  const out: RobloxProcess[] = []
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.,]+)\s+(\S+)\s+(-?\d+)\s+(.+)$/)
    if (!m) continue
    const comm = m[6]
    if (!/\/RobloxPlayer$/.test(comm)) continue
    const nice = Number(m[5])
    out.push({
      pid: Number(m[1]),
      memoryMb: Math.round(Number(m[2]) / 1024),
      cpu: Number(m[3].replace(',', '.')) || 0,
      uptimeSec: parseEtime(m[4]),
      priority: nice < 0 ? 'High' : nice > 5 ? 'Low' : nice > 0 ? 'BelowNormal' : 'Normal'
    })
  }
  return out
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
