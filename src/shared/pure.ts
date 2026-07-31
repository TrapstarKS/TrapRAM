import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto'
import type { Account, GroupMeta, LaunchTarget, Preset, PrivateServer, SyncPayload } from './types'

const GROUP_HUES = [265, 25, 150, 200, 330, 95, 60, 295]

export function groupColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return `oklch(0.72 0.15 ${GROUP_HUES[h % GROUP_HUES.length]})`
}

export function groupsOf(accounts: Account[]): GroupMeta[] {
  return [...new Set(accounts.map((a) => a.group).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .map((name, order) => ({ name, color: groupColor(name), order }))
}

export const regionMismatch = (home: string | undefined, here: string): boolean =>
  !!home && !!here && home !== here

export function seal(key: Buffer, plain: Buffer): Buffer {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([c.update(plain), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), body])
}

export function open(key: Buffer, blob: Buffer): Buffer {
  const d = createDecipheriv('aes-256-gcm', key, blob.subarray(0, 12))
  d.setAuthTag(blob.subarray(12, 28))
  return Buffer.concat([d.update(blob.subarray(28)), d.final()])
}

export function buildUri(ticket: string, t: LaunchTarget, tracker: number, now: number): string {
  const params = new URLSearchParams()
  params.set('request', t.linkCode ? 'RequestPrivateGame' : 'RequestGame')
  params.set('browserTrackerId', String(tracker))
  params.set('placeId', String(t.placeId))
  params.set('isPlayTogetherGame', 'false')
  if (t.jobId) params.set('gameId', t.jobId)
  if (t.accessCode) params.set('accessCode', t.accessCode)
  else if (t.linkCode) params.set('accessCode', t.linkCode)
  if (t.linkCode) params.set('linkCode', t.linkCode)

  const launcher = encodeURIComponent(`https://assetgame.roblox.com/game/PlaceLauncher.ashx?${params.toString()}`)
  return [
    'roblox-player:1',
    'launchmode:play',
    `gameinfo:${ticket}`,
    `launchtime:${now}`,
    `placelauncherurl:${launcher}`,
    `browsertrackerid:${tracker}`,
    'robloxLocale:en_us',
    'gameLocale:en_us',
    'channel:'
  ].join('+')
}

const ACCOUNT_KEYS = [
  'Username',
  'UserId',
  'CredentialValue',
  'DisplayName',
  'AccountBlob',
  'PlayerHydrationBlob',
  'LastSuccessfulSignInMethod',
  'WebLogin',
  'Membership',
  'HasRobloxSubscription',
  'IsUnder13',
  'AuthenticatedTheme',
  'ActivePartyId',
  'UnifiedPurchaseFlowExpirationTimeSecondsUTC'
]

const REGENERATE = ['AppInstallationId', 'BrowserTrackerId']

const USER_KEY = /^(u_)?\d{6,}$/

function mapsUserIds(value: unknown): boolean {
  let obj = value
  if (typeof obj === 'string') {
    if (!obj.startsWith('{')) return false
    try {
      obj = JSON.parse(obj)
    } catch {
      return false
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  const keys = Object.keys(obj as Record<string, unknown>)
  return keys.length > 0 && keys.every((k) => USER_KEY.test(k))
}

export function sanitizeAppStorage(
  storage: Record<string, unknown>,
  freshId: () => string
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(storage)) {
    if (ACCOUNT_KEYS.includes(key)) continue
    if (mapsUserIds(value)) continue
    out[key] = REGENERATE.includes(key) ? freshId() : value
  }
  for (const key of REGENERATE) if (!(key in out)) out[key] = freshId()
  out.IsFirstLaunchAfterInstall = false
  return out
}

export function parseEtime(raw: string): number {
  const value = raw.replace(',', '.')
  const [days, rest] = value.includes('-') ? value.split('-') : ['0', value]
  const parts = rest.split(':').map(Number)
  if (parts.some(Number.isNaN)) return 0
  while (parts.length < 3) parts.unshift(0)
  return Number(days) * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2]
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789'
const KEY_LEN = 25

export function newSyncKey(): string {
  let key = ''
  for (const b of randomBytes(KEY_LEN)) key += ALPHABET[b >> 3]
  return key
}

export function normalizeSyncKey(raw: string): string {
  const key = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V')
  if (key.length !== KEY_LEN || [...key].some((c) => !ALPHABET.includes(c))) {
    throw new Error('That does not look like a TrapRAM sync key')
  }
  return key
}

export const formatSyncKey = (key: string): string => key.match(/.{5}/g)?.join('-') ?? key

export function deriveSync(key: string): { room: string; enc: Buffer } {
  const ikm = Buffer.from(key, 'utf8')
  const salt = Buffer.from('trapram-sync-1', 'utf8')
  return {
    room: Buffer.from(hkdfSync('sha256', ikm, salt, 'room', 16)).toString('hex'),
    enc: Buffer.from(hkdfSync('sha256', ikm, salt, 'enc', 32))
  }
}

const ts = (iso?: string): number => (iso ? Date.parse(iso) || 0 : 0)

const edited = (a?: Account): number => (a ? Math.max(ts(a.updatedAt), ts(a.addedAt)) : 0)

const health = (a?: Account): number => (a?.cookieExpired === false ? 1e15 : 0) + ts(a?.lastValidated)

const TOMBSTONE_MS = 60 * 86400 * 1000

export function shareable(a: Account): Account {
  const out: Account = { ...a, presence: { type: 0, lastLocation: '' }, avatarUrl: '' }
  delete out.lastLaunch
  return out
}

export interface MergeStats {
  added: number
  updated: number
  cookies: number
  removed: number
}

export function mergeVault(
  local: SyncPayload,
  remote: SyncPayload,
  now: number
): { merged: SyncPayload; stats: MergeStats } {
  const tombstones: Record<string, string> = {}
  for (const src of [local.tombstones, remote.tombstones]) {
    for (const [id, at] of Object.entries(src ?? {})) {
      if (now - ts(at) > TOMBSTONE_MS) continue
      if (ts(at) > ts(tombstones[id])) tombstones[id] = at
    }
  }

  const accounts: Account[] = []
  const cookies: Record<string, string> = {}
  const stats: MergeStats = { added: 0, updated: 0, cookies: 0, removed: 0 }

  const ids = [...new Set([...local.accounts, ...remote.accounts].map((a) => a.userId))]
  for (const userId of ids) {
    const key = String(userId)
    const l = local.accounts.find((a) => a.userId === userId)
    const r = remote.accounts.find((a) => a.userId === userId)

    if (ts(tombstones[key]) >= Math.max(edited(l), edited(r))) {
      if (l) stats.removed++
      continue
    }

    const takeRemote = !l || (!!r && edited(r) > edited(l))
    const merged: Account = { ...(takeRemote ? r! : l) }
    if (!l) stats.added++
    else if (takeRemote) stats.updated++

    const lc = local.cookies[key]
    const rc = remote.cookies[key]
    const fromRemote = rc && (!lc || health(r) > health(l))
    const cookie = fromRemote ? rc : lc
    if (cookie) {
      cookies[key] = cookie
      const owner = fromRemote ? r : l
      if (owner) {
        merged.cookieExpired = owner.cookieExpired
        merged.lastValidated = owner.lastValidated
      }
      if (fromRemote && cookie !== lc) stats.cookies++
    }
    accounts.push(merged)
  }

  accounts.sort((a, b) => a.order - b.order || a.userId - b.userId)
  accounts.forEach((a, i) => {
    a.order = i
  })

  const byKey = <T>(list: T[], other: T[], key: (v: T) => string): T[] => {
    const out = [...list]
    const seen = new Set(list.map(key))
    for (const v of other) if (!seen.has(key(v))) out.push(v)
    return out
  }

  return {
    merged: {
      accounts,
      cookies,
      tombstones,
      presets: byKey<Preset>(local.presets, remote.presets, (p) => p.id),
      servers: byKey<PrivateServer>(local.servers, remote.servers, (s) => s.id)
    },
    stats
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(src)
        .sort()
        .map((k) => [k, canonical(src[k])])
    )
  }
  return value
}

export function fingerprint(p: SyncPayload): string {
  return JSON.stringify(
    canonical({
      accounts: [...p.accounts].sort((a, b) => a.userId - b.userId),
      cookies: p.cookies,
      tombstones: p.tombstones,
      presets: [...p.presets].sort((a, b) => a.id.localeCompare(b.id)),
      servers: [...p.servers].sort((a, b) => a.id.localeCompare(b.id))
    })
  )
}

export function realPids(pids: unknown): number[] {
  if (!Array.isArray(pids)) return []
  return [...new Set(pids.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))]
}

export type Gate = <T>(fn: () => Promise<T>) => Promise<T>

export function gate(): Gate {
  let chain: Promise<unknown> = Promise.resolve()
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn)
    chain = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }
}

export interface Cell {
  x: number
  y: number
  w: number
  h: number
}

export function grid(count: number, w: number, h: number, x0 = 0, y0 = 0): Cell[] {
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  const cw = Math.floor(w / cols)
  const ch = Math.floor(h / rows)
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols)
    const inRow = Math.min(cols, count - row * cols)
    const offset = row === rows - 1 && inRow < cols ? Math.floor((w - inRow * cw) / 2) : 0
    return { x: x0 + offset + (i % cols) * cw, y: y0 + row * ch, w: cw, h: ch }
  })
}

export interface Launch {
  userId: number
  at: number
}

export interface Owned {
  uptimeSec: number
  background: boolean
  userId?: number
}

const CLAIM_AHEAD_MS = 15_000
const CLAIM_BEHIND_MS = 180_000

export function claimOwners<T extends Owned>(list: T[], launches: Launch[], now: number): T[] {
  const taken = new Set(list.map((p) => p.userId).filter((id): id is number => id !== undefined))
  const free = launches.filter((l) => !taken.has(l.userId))
  if (!free.length) return list

  for (const p of list
    .filter((x) => x.userId === undefined && !x.background)
    .sort((a, b) => b.uptimeSec - a.uptimeSec)) {
    const startedAt = now - p.uptimeSec * 1000
    let best = -1
    for (let i = 0; i < free.length; i++) {
      const gap = startedAt - free[i].at
      if (gap < -CLAIM_AHEAD_MS || gap > CLAIM_BEHIND_MS) continue
      if (best < 0 || free[i].at > free[best].at) best = i
    }
    if (best < 0) continue
    p.userId = free[best].userId
    free.splice(best, 1)
  }
  return list
}
