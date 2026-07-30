import { app } from 'electron'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import { sanitizeAppStorage, gate } from '@shared/pure'
import { isWin } from './launcher'
import { processes } from './system'

const swaps = gate()

interface Slot {
  live: string
  name: string
  json: boolean
}

function slots(): Slot[] {
  if (isWin) {
    const local = process.env.LOCALAPPDATA ?? ''
    return [
      { live: join(local, 'Roblox', 'LocalStorage', 'appStorage.json'), name: 'appStorage.json', json: true },
      { live: join(local, 'Roblox', 'LocalStorage', 'RobloxCookies.dat'), name: 'RobloxCookies.dat', json: false },
      { live: join(local, 'Roblox', 'rbx-storage.id'), name: 'rbx-storage.id', json: false }
    ]
  }
  const base = join(homedir(), 'Library', 'Roblox')
  return [
    { live: join(base, 'LocalStorage', 'appStorage.json'), name: 'appStorage.json', json: true },
    { live: join(base, 'rbx-storage.id'), name: 'rbx-storage.id', json: false },
    { live: join(base, 'GlobalBasicSettings_13.xml'), name: 'GlobalBasicSettings_13.xml', json: false }
  ]
}

const profileDir = (userId: number): string => join(app.getPath('userData'), 'clients', String(userId))
const activeFile = (): string => join(app.getPath('userData'), 'clients', 'active')

const freshId = (): string => String(BigInt(`0x${randomBytes(8).toString('hex')}`) % 10_000_000_000_000_000n)

async function readActive(): Promise<number | null> {
  try {
    return Number(await fs.readFile(activeFile(), 'utf8')) || null
  } catch {
    return null
  }
}

async function stash(userId: number): Promise<void> {
  const dir = profileDir(userId)
  await fs.mkdir(dir, { recursive: true })
  for (const slot of slots()) {
    try {
      await fs.copyFile(slot.live, join(dir, slot.name))
    } catch {}
  }
}

async function seed(userId: number): Promise<void> {
  const dir = profileDir(userId)
  await fs.mkdir(dir, { recursive: true })

  for (const slot of slots()) {
    const target = join(dir, slot.name)
    if (slot.name === 'rbx-storage.id') {
      await fs.writeFile(target, randomBytes(8))
      continue
    }
    if (slot.json) {
      let base: Record<string, unknown> = {}
      try {
        base = JSON.parse(await fs.readFile(slot.live, 'utf8'))
      } catch {}
      await fs.writeFile(target, JSON.stringify(sanitizeAppStorage(base, freshId)))
      continue
    }
    try {
      await fs.copyFile(slot.live, target)
    } catch {}
  }
}

async function restore(userId: number): Promise<void> {
  const dir = profileDir(userId)
  await fs.mkdir(join(activeFile(), '..'), { recursive: true })
  await fs.writeFile(activeFile(), String(userId))
  for (const slot of slots()) {
    const source = join(dir, slot.name)
    try {
      await fs.mkdir(join(slot.live, '..'), { recursive: true })
      await fs.copyFile(source, slot.live)
    } catch {}
  }
}

export interface SwapResult {
  swapped: boolean
  reason?: 'already-active' | 'client-running'
}

export async function activate(userId: number): Promise<SwapResult> {
  return swaps(async () => {
    const active = await readActive()
    if (active === userId) return { swapped: false, reason: 'already-active' }
    if ((await processes()).length > 0) return { swapped: false, reason: 'client-running' }

    if (active !== null) await stash(active)

    try {
      await fs.access(join(profileDir(userId), 'appStorage.json'))
    } catch {
      await seed(userId)
    }

    await restore(userId)
    return { swapped: true }
  })
}

export async function forget(userId: number): Promise<void> {
  return swaps(async () => {
    await fs.rm(profileDir(userId), { recursive: true, force: true })
    if ((await readActive()) === userId) await fs.rm(activeFile(), { force: true })
  })
}
