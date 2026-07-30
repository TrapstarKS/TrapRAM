import type { SyncPayload } from '@shared/types'
import {
  seal,
  open,
  mergeVault,
  fingerprint,
  shareable,
  deriveSync,
  newSyncKey,
  normalizeSyncKey,
  formatSyncKey,
  type MergeStats
} from '@shared/pure'
import type { Vault, VaultData } from './vault'
import * as store from './settings'

const MAX_BLOB = 4 * 1024 * 1024
const TIMEOUT_MS = 15_000
const NOT_A_RELAY =
  'That URL answered, but it is not a TrapRAM relay — deploy the worker in worker/ and use the URL wrangler prints'

export { newSyncKey as newKey, normalizeSyncKey as normalizeKey }

const endpointOf = (url: string, room: string): string => `${url.trim().replace(/\/+$/, '')}/r/${room}`

const payloadOf = (d: VaultData): SyncPayload => ({
  accounts: d.accounts.map(shareable),
  cookies: d.cookies,
  groups: d.groups,
  presets: d.presets,
  servers: d.servers,
  tombstones: d.tombstones ?? {}
})

const fill = (p: Partial<SyncPayload>): SyncPayload => ({
  accounts: p.accounts ?? [],
  cookies: p.cookies ?? {},
  groups: p.groups ?? [],
  presets: p.presets ?? [],
  servers: p.servers ?? [],
  tombstones: p.tombstones ?? {}
})

async function pull(
  endpoint: string,
  enc: Buffer
): Promise<{ version: number; payload: SyncPayload } | null> {
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Relay answered ${res.status}`)
  const body = (await res.json()) as { v: number; blob: string }
  try {
    return {
      version: body.v,
      payload: fill(JSON.parse(open(enc, Buffer.from(body.blob, 'base64')).toString('utf8')))
    }
  } catch {
    throw new Error('Sync key does not match the data already on this relay')
  }
}

async function push(endpoint: string, enc: Buffer, payload: SyncPayload, version: number): Promise<boolean> {
  const blob = seal(enc, Buffer.from(JSON.stringify(payload), 'utf8')).toString('base64')
  if (blob.length > MAX_BLOB) throw new Error('Vault is too large to sync through the relay')
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'content-type': 'text/plain', 'if-match': String(version) },
    body: blob,
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (res.status === 409) return false
  if (res.status === 404 || res.status === 405) throw new Error(NOT_A_RELAY)
  if (!res.ok) throw new Error(`Relay answered ${res.status}`)
  return true
}

export async function probe(url: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(url.trim().replace(/\/+$/, ''), { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new Error(`Could not reach ${url}`)
  }
  const body = (await res.json().catch(() => null)) as { relay?: string } | null
  if (body?.relay !== 'trapram') throw new Error(NOT_A_RELAY)
}

export interface SyncResult extends MergeStats {
  pushed: boolean
  pulled: boolean
}

const summarize = (r: SyncResult): string => {
  const bits = [
    r.added && `${r.added} added`,
    r.updated && `${r.updated} updated`,
    r.cookies && `${r.cookies} session${r.cookies > 1 ? 's' : ''} recovered`,
    r.removed && `${r.removed} removed`
  ].filter(Boolean)
  if (bits.length) return bits.join(', ')
  return r.pushed ? 'uploaded' : 'already up to date'
}

let busy = false
let last: { at?: string; error?: string; summary?: string } = {}

export const lastRun = (): typeof last => last

export function status(vault: Vault): { configured: boolean; key: string } {
  const key = vault.isUnlocked ? (vault.read().syncKey ?? '') : ''
  return { configured: !!key && !!store.get().syncUrl, key: key ? formatSyncKey(key) : '' }
}

export const isBusy = (): boolean => busy

export async function wipe(vault: Vault): Promise<void> {
  const key = vault.read().syncKey
  const url = store.get().syncUrl
  if (!key || !url) return
  const { room } = deriveSync(key)
  await fetch(endpointOf(url, room), { method: 'DELETE', signal: AbortSignal.timeout(TIMEOUT_MS) })
  last = {}
}

export async function run(vault: Vault): Promise<SyncResult> {
  if (busy) throw new Error('A sync is already running')
  const url = store.get().syncUrl
  if (!url) throw new Error('No relay URL set')
  const key = vault.read().syncKey
  if (!key) throw new Error('Sync is not set up on this device')

  const { room, enc } = deriveSync(key)
  const endpoint = endpointOf(url, room)
  busy = true
  try {
    let result: SyncResult = { added: 0, updated: 0, cookies: 0, removed: 0, pushed: false, pulled: false }

    for (let attempt = 0; attempt < 2; attempt++) {
      const local = payloadOf(vault.read())
      const remote = await pull(endpoint, enc)

      if (!remote) {
        await push(endpoint, enc, local, 0)
        result = { ...result, pushed: true }
        break
      }

      const { merged, stats } = mergeVault(local, remote.payload, Date.now())
      const mergedFp = fingerprint(merged)
      const pulled = mergedFp !== fingerprint(local)

      if (pulled) {
        await vault.mutate((d) => {
          const here = new Map(d.accounts.map((a) => [a.userId, a]))
          Object.assign(d, merged, {
            accounts: merged.accounts.map((a) => {
              const prev = here.get(a.userId)
              return prev
                ? { ...a, presence: prev.presence, avatarUrl: prev.avatarUrl, lastLaunch: prev.lastLaunch }
                : a
            })
          })
        })
      }

      result = { ...stats, pulled, pushed: false }
      if (mergedFp === fingerprint(remote.payload)) break
      if (await push(endpoint, enc, merged, remote.version)) {
        result.pushed = true
        break
      }
    }

    last = { at: new Date().toISOString(), summary: summarize(result) }
    return result
  } catch (e) {
    last = { at: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) }
    throw e
  } finally {
    busy = false
  }
}
