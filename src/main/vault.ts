import { app, safeStorage } from 'electron'
import { randomBytes, scrypt } from 'node:crypto'
import { promisify } from 'node:util'
import { join } from 'node:path'
import fs from 'node:fs/promises'
import type { Account, Preset, PrivateServer, VaultStatus } from '@shared/types'
import { seal, open } from '@shared/pure'
import { writeAtomic } from '@shared/atomic'

const scryptAsync = promisify(scrypt) as (
  pw: Buffer,
  salt: Buffer,
  len: number,
  opts: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>

const KDF = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }

export interface VaultData {
  accounts: Account[]
  cookies: Record<string, string>
  presets: Preset[]
  servers: PrivateServer[]
  tombstones: Record<string, string>

  syncKey?: string
}

interface VaultMeta {
  v: 1
  mode: 'keychain' | 'password'
  wrapped: string
  salt?: string
}

const empty = (): VaultData => ({
  accounts: [],
  cookies: {},
  presets: [],
  servers: [],
  tombstones: {}
})

export class Vault {
  private dir = app.getPath('userData')
  private metaPath = join(this.dir, 'vault.json')
  private dataPath = join(this.dir, 'accounts.enc')
  private key: Buffer | null = null
  private data: VaultData = empty()
  private meta: VaultMeta | null = null
  private lockTimer: NodeJS.Timeout | null = null
  private lockAfterMs = 0
  onLock: (() => void) | null = null

  async init(): Promise<VaultStatus> {
    await fs.mkdir(this.dir, { recursive: true })
    try {
      this.meta = JSON.parse(await fs.readFile(this.metaPath, 'utf8'))
    } catch {
      this.meta = null
    }
    if (this.meta?.mode === 'keychain' && safeStorage.isEncryptionAvailable()) {
      try {
        this.key = Buffer.from(safeStorage.decryptString(Buffer.from(this.meta.wrapped, 'base64')), 'base64')
        await this.load()
      } catch {
        this.key = null
      }
    }
    return this.status()
  }

  status(): VaultStatus {
    return {
      initialized: !!this.meta,
      locked: !this.key,
      mode: this.meta?.mode ?? (safeStorage.isEncryptionAvailable() ? 'keychain' : 'password')
    }
  }

  get isUnlocked(): boolean {
    return !!this.key
  }

  async create(mode: 'keychain' | 'password', password?: string): Promise<void> {
    const dek = randomBytes(32)
    if (mode === 'keychain') {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('OS keychain unavailable on this machine')
      this.meta = { v: 1, mode, wrapped: safeStorage.encryptString(dek.toString('base64')).toString('base64') }
    } else {
      if (!password || password.length < 8) throw new Error('Password must be at least 8 characters')
      const salt = randomBytes(16)
      const kek = await scryptAsync(Buffer.from(password, 'utf8'), salt, 32, KDF)
      this.meta = { v: 1, mode, wrapped: seal(kek, dek).toString('base64'), salt: salt.toString('base64') }
    }
    this.key = dek
    this.data = empty()
    await writeAtomic(this.metaPath, JSON.stringify(this.meta))
    await this.save()
  }

  async unlock(password: string): Promise<void> {
    if (!this.meta) throw new Error('Vault not set up')
    if (this.meta.mode === 'keychain') {
      const raw = safeStorage.decryptString(Buffer.from(this.meta.wrapped, 'base64'))
      this.key = Buffer.from(raw, 'base64')
    } else {
      const salt = Buffer.from(this.meta.salt!, 'base64')
      const kek = await scryptAsync(Buffer.from(password, 'utf8'), salt, 32, KDF)
      try {
        this.key = open(kek, Buffer.from(this.meta.wrapped, 'base64'))
      } catch {
        throw new Error('Wrong password')
      }
    }
    await this.load()
    this.touch()
  }

  lock(): void {
    if (this.key) this.key.fill(0)
    this.key = null
    this.data = empty()
    if (this.lockTimer) clearTimeout(this.lockTimer)
    this.lockTimer = null
    this.onLock?.()
  }

  setAutoLock(minutes: number): void {
    this.lockAfterMs = Math.max(0, minutes) * 60_000
    this.touch()
  }

  touch(): void {
    if (this.lockTimer) clearTimeout(this.lockTimer)
    this.lockTimer = null
    if (this.lockAfterMs > 0 && this.key) {
      this.lockTimer = setTimeout(() => this.lock(), this.lockAfterMs)
      this.lockTimer.unref()
    }
  }

  async changePassword(current: string, next: string): Promise<void> {
    if (!this.meta) throw new Error('Vault not set up')
    if (this.meta.mode === 'password') {
      const salt = Buffer.from(this.meta.salt!, 'base64')
      const kek = await scryptAsync(Buffer.from(current, 'utf8'), salt, 32, KDF)
      try {
        open(kek, Buffer.from(this.meta.wrapped, 'base64'))
      } catch {
        throw new Error('Wrong password')
      }
    }
    if (!this.key) throw new Error('Vault is locked')
    if (next.length < 8) throw new Error('Password must be at least 8 characters')
    const salt = randomBytes(16)
    const kek = await scryptAsync(Buffer.from(next, 'utf8'), salt, 32, KDF)
    this.meta = { v: 1, mode: 'password', wrapped: seal(kek, this.key).toString('base64'), salt: salt.toString('base64') }
    await writeAtomic(this.metaPath, JSON.stringify(this.meta))
  }

  async switchToKeychain(): Promise<void> {
    if (!this.key) throw new Error('Vault is locked')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('OS keychain unavailable on this machine')
    this.meta = {
      v: 1,
      mode: 'keychain',
      wrapped: safeStorage.encryptString(this.key.toString('base64')).toString('base64')
    }
    await writeAtomic(this.metaPath, JSON.stringify(this.meta))
  }

  private async load(): Promise<void> {
    try {
      const blob = await fs.readFile(this.dataPath)
      this.data = { ...empty(), ...JSON.parse(open(this.key!, blob).toString('utf8')) }
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        this.data = empty()
        return
      }
      throw new Error('Vault data is corrupted or the key does not match')
    }
  }

  async save(): Promise<void> {
    if (!this.key) throw new Error('Vault is locked')
    await writeAtomic(this.dataPath, seal(this.key, Buffer.from(JSON.stringify(this.data), 'utf8')))
  }

  read(): VaultData {
    if (!this.key) throw new Error('Vault is locked')
    return this.data
  }

  async mutate(fn: (d: VaultData) => void): Promise<void> {
    const d = this.read()
    fn(d)
    await this.save()
  }

  cookie(userId: number): string {
    const c = this.read().cookies[String(userId)]
    if (!c) throw new Error('No stored cookie for this account')
    return c
  }

  async exportBackup(password: string): Promise<Buffer> {
    if (password.length < 8) throw new Error('Backup password must be at least 8 characters')
    const salt = randomBytes(16)
    const kek = await scryptAsync(Buffer.from(password, 'utf8'), salt, 32, KDF)
    const body = seal(kek, Buffer.from(JSON.stringify(this.read()), 'utf8'))
    return Buffer.concat([Buffer.from('TRAM1'), salt, body])
  }

  async importBackup(blob: Buffer, password: string, merge: boolean): Promise<number> {
    if (blob.subarray(0, 5).toString() !== 'TRAM1') throw new Error('Not a TrapRAM backup file')
    const salt = blob.subarray(5, 21)
    const kek = await scryptAsync(Buffer.from(password, 'utf8'), salt, 32, KDF)
    let parsed: VaultData
    try {
      parsed = JSON.parse(open(kek, blob.subarray(21)).toString('utf8'))
    } catch {
      throw new Error('Wrong password or damaged backup')
    }
    const d = this.read()
    if (!merge) {
      Object.assign(d, { ...empty(), ...parsed })
      await this.save()
      return parsed.accounts.length
    }
    let added = 0
    for (const acc of parsed.accounts) {
      if (d.accounts.some((a) => a.userId === acc.userId)) continue
      d.accounts.push(acc)
      const c = parsed.cookies[String(acc.userId)]
      if (c) d.cookies[String(acc.userId)] = c
      added++
    }
    for (const p of parsed.presets) if (!d.presets.some((x) => x.id === p.id)) d.presets.push(p)
    for (const s of parsed.servers) if (!d.servers.some((x) => x.id === s.id)) d.servers.push(s)
    await this.save()
    return added
  }
}
