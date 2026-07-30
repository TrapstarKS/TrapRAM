import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import fs from 'node:fs/promises'

const run = promisify(execFile)

const SEMAPHORE = '/RobloxPlayerUniq'
const MAX_SLOTS = 8

const instancesDir = (): string => join(app.getPath('userData'), 'instances')
const slotDir = (i: number): string => join(instancesDir(), `slot-${i}`)

function helperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'trapram-semunlink')
    : join(app.getAppPath(), 'build', 'mac', 'trapram-semunlink')
}

async function sourceBundle(): Promise<string> {
  for (const p of ['/Applications/Roblox.app', join(homedir(), 'Applications', 'Roblox.app')]) {
    try {
      await fs.access(join(p, 'Contents', 'Info.plist'))
      return p
    } catch {}
  }
  throw new Error('Roblox.app was not found in Applications')
}

async function releaseSemaphore(): Promise<void> {
  try {
    await run(helperPath(), [SEMAPHORE])
    return
  } catch {}
  await run('/usr/bin/python3', [
    '-c',
    `from _multiprocessing import sem_unlink\ntry: sem_unlink(${JSON.stringify(SEMAPHORE)})\nexcept FileNotFoundError: pass`
  ]).catch(() => undefined)
}

async function runningCommands(): Promise<string> {
  const { stdout } = await run('/bin/ps', ['-axo', 'command='], { maxBuffer: 8 * 1024 * 1024 }).catch(() => ({
    stdout: ''
  }))
  return stdout
}

async function nestedCode(bundle: string): Promise<string[]> {
  const out: string[] = []
  for (const sub of ['Contents/MacOS', 'Contents/Frameworks']) {
    const dir = join(bundle, sub)
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (name === 'RobloxPlayer' || name === 'ClientSettings') continue
      out.push(join(dir, name))
    }
  }
  return out
}

async function buildSlot(index: number, source: string): Promise<string> {
  const dir = slotDir(index)
  const bundle = join(dir, 'Roblox.app')
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })

  try {
    await run('/bin/cp', ['-c', '-a', source, bundle])
  } catch {
    await run('/bin/cp', ['-a', source, bundle])
  }

  const settings = join(bundle, 'Contents', 'MacOS', 'ClientSettings')
  const stash = join(dir, 'ClientSettings')
  await fs.rename(settings, stash).catch(() => undefined)

  await run('/usr/bin/plutil', [
    '-replace',
    'LSMultipleInstancesProhibited',
    '-bool',
    'NO',
    join(bundle, 'Contents', 'Info.plist')
  ])

  const entitlements = join(dir, 'entitlements.plist')
  await run('/usr/bin/codesign', ['-d', '--entitlements', entitlements, '--xml', source]).catch(() => undefined)
  try {
    await run('/usr/bin/plutil', ['-convert', 'xml1', entitlements])
  } catch {
    await fs.writeFile(
      entitlements,
      '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict/></plist>'
    )
  }

  await run('/usr/bin/plutil', [
    '-replace',
    'com\\.apple\\.security\\.cs\\.disable-library-validation',
    '-bool',
    'YES',
    entitlements
  ])

  for (const path of await nestedCode(bundle)) {
    await run('/usr/bin/codesign', ['--force', '--sign', '-', path]).catch(() => undefined)
  }

  try {
    await run('/usr/bin/codesign', [
      '--force',
      '--sign',
      '-',
      '--options',
      'runtime',
      '--entitlements',
      entitlements,
      bundle
    ])
  } catch (e) {
    throw new Error(
      `Could not re-sign the Roblox copy (${basename(dir)}). Install the Xcode command line tools with "xcode-select --install" and try again. ${
        e instanceof Error ? e.message : ''
      }`.trim()
    )
  }

  await fs.rename(stash, settings).catch(() => undefined)
  await fs.writeFile(join(dir, 'stamp'), await sourceStamp(source))
  return bundle
}

async function sourceStamp(source: string): Promise<string> {
  const s = await fs.stat(join(source, 'Contents', 'Info.plist'))
  return `${s.mtimeMs}:${s.size}`
}

async function slotIsCurrent(index: number, source: string): Promise<boolean> {
  try {
    const [stamp, current] = await Promise.all([
      fs.readFile(join(slotDir(index), 'stamp'), 'utf8'),
      sourceStamp(source)
    ])
    if (stamp !== current) return false
    await fs.access(join(slotDir(index), 'Roblox.app', 'Contents', 'MacOS', 'RobloxPlayer'))
    return true
  } catch {
    return false
  }
}

async function syncSettings(source: string, bundle: string): Promise<void> {
  const from = join(source, 'Contents', 'MacOS', 'ClientSettings')
  const to = join(bundle, 'Contents', 'MacOS', 'ClientSettings')
  try {
    await fs.access(from)
  } catch {
    await fs.rm(to, { recursive: true, force: true })
    return
  }
  await fs.rm(to, { recursive: true, force: true })
  await run('/bin/cp', ['-a', from, to]).catch(() => undefined)
}

export async function launch(uri: string): Promise<number> {
  const source = await sourceBundle()
  const busy = await runningCommands()

  let index = 0
  while (index < MAX_SLOTS && busy.includes(`${slotDir(index)}/Roblox.app/Contents/MacOS/RobloxPlayer`)) index++
  if (index === MAX_SLOTS) throw new Error(`All ${MAX_SLOTS} client slots are in use`)

  const bundle = (await slotIsCurrent(index, source))
    ? join(slotDir(index), 'Roblox.app')
    : await buildSlot(index, source)

  await syncSettings(source, bundle)
  await releaseSemaphore()
  await run('/usr/bin/open', ['-a', bundle, uri])
  await releaseSemaphore()
  return index
}

export async function reset(): Promise<void> {
  await fs.rm(instancesDir(), { recursive: true, force: true })
}
