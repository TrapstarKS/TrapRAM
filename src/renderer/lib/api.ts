import type { Account, GroupMeta, Preset, PrivateServer, Settings, VaultStatus } from '@shared/types'

declare global {
  interface Window {
    api: {
      call<T>(channel: string, ...args: unknown[]): Promise<T>
      on(channel: string, fn: (payload: never) => void): () => void
    }
  }
}

export interface Snapshot {
  accounts: Account[]
  groups: GroupMeta[]
  presets: Preset[]
  servers: PrivateServer[]
  withCookie: number[]
}

export const api = {
  call: <T,>(channel: string, ...args: unknown[]): Promise<T> => window.api.call<T>(channel, ...args),
  on: window.api.on
}

export const vaultStatus = (): Promise<VaultStatus> => api.call('vault:status')
export const getSettings = (): Promise<Settings> => api.call('settings:get')
export const setSettings = (patch: Partial<Settings>): Promise<Settings> => api.call('settings:set', patch)
export const getData = (): Promise<Snapshot> => api.call('data:all')

export function presenceLabel(type: number): string {
  return ['Offline', 'Online', 'In game', 'In Studio'][type] ?? 'Unknown'
}

export function presenceColor(type: number): string {
  return ['var(--color-faint)', 'var(--color-ok)', 'var(--color-accent)', 'var(--color-warn)'][type] ?? 'var(--color-faint)'
}

export function relative(iso?: string): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString()
}

export function duration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}
