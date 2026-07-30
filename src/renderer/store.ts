import { create } from 'zustand'
import type { Account, Settings, Toast, UpdateState, VaultStatus } from '@shared/types'
import { api, getData, getSettings, type Snapshot } from './lib/api'

export type Tab = 'launch' | 'games' | 'servers' | 'private' | 'performance' | 'settings'

interface State extends Snapshot {
  vault: VaultStatus | null
  settings: Settings | null
  update: UpdateState
  tab: Tab
  selected: number[]
  query: string
  groupFilter: string
  toasts: Toast[]
  busy: string | null

  setTab: (t: Tab) => void
  setQuery: (q: string) => void
  setGroupFilter: (g: string) => void
  select: (id: number, mode?: 'toggle' | 'only' | 'range') => void
  selectAll: (ids: number[]) => void
  clearSelection: () => void
  toast: (kind: Toast['kind'], text: string) => void
  dismiss: (id: string) => void
  setBusy: (label: string | null) => void
  hydrate: () => Promise<void>
  patchSettings: (patch: Partial<Settings>) => Promise<void>
  run: <T>(label: string, fn: () => Promise<T>, success?: string) => Promise<T | undefined>
}

const emptySnapshot: Snapshot = { accounts: [], groups: [], presets: [], servers: [], withCookie: [] }

export const useStore = create<State>((set, get) => ({
  ...emptySnapshot,
  vault: null,
  settings: null,
  update: { status: 'idle' },
  tab: 'launch',
  selected: [],
  query: '',
  groupFilter: '',
  toasts: [],
  busy: null,

  setTab: (tab) => set({ tab }),
  setQuery: (query) => set({ query }),
  setGroupFilter: (groupFilter) => set({ groupFilter }),

  select: (id, mode = 'only') => {
    const { selected } = get()
    if (mode === 'only') return set({ selected: [id] })
    if (mode === 'toggle')
      return set({ selected: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] })
    const ordered = visibleAccounts(get()).map((a) => a.userId)
    const anchor = selected.at(-1)
    if (anchor === undefined) return set({ selected: [id] })
    const a = ordered.indexOf(anchor)
    const b = ordered.indexOf(id)
    if (a < 0 || b < 0) return set({ selected: [id] })
    const range = ordered.slice(Math.min(a, b), Math.max(a, b) + 1)
    set({ selected: [...new Set([...selected, ...range])] })
  },
  selectAll: (ids) => set({ selected: ids }),
  clearSelection: () => set({ selected: [] }),

  toast: (kind, text) => {
    const id = Math.random().toString(36).slice(2)
    set({ toasts: [...get().toasts.slice(-3), { id, kind, text }] })
    setTimeout(() => get().dismiss(id), kind === 'err' ? 7000 : 3600)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setBusy: (busy) => set({ busy }),

  hydrate: async () => {
    const [vault, settings] = await Promise.all([api.call<VaultStatus>('vault:status'), getSettings()])
    set({ vault, settings })
    document.documentElement.dataset.theme =
      settings.theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : settings.theme
    if (!vault.locked) set(await getData())
  },

  patchSettings: async (patch) => {
    const settings = await api.call<Settings>('settings:set', patch)
    set({ settings })
    if (patch.theme)
      document.documentElement.dataset.theme =
        patch.theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark'
          : patch.theme
  },

  run: async (label, fn, success) => {
    set({ busy: label })
    try {
      const value = await fn()
      if (success) get().toast('ok', success)
      return value
    } catch (e) {
      get().toast('err', e instanceof Error ? e.message : String(e))
      return undefined
    } finally {
      set({ busy: null })
    }
  }
}))

export function visibleAccounts(s: Pick<State, 'accounts' | 'query' | 'groupFilter' | 'settings'>): Account[] {
  const q = s.query.trim().toLowerCase()
  const mode = s.settings?.sortMode ?? 'custom'
  return s.accounts
    .filter((a) => (s.groupFilter ? a.group === s.groupFilter : true))
    .filter((a) =>
      q
        ? `${a.username} ${a.displayName} ${a.alias} ${a.group} ${a.note}`.toLowerCase().includes(q) ||
          String(a.userId).includes(q)
        : true
    )
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (mode === 'name') return (a.alias || a.username).localeCompare(b.alias || b.username)
      if (mode === 'status') return b.presence.type - a.presence.type || a.username.localeCompare(b.username)
      if (mode === 'recent') return (b.lastLaunch ?? '').localeCompare(a.lastLaunch ?? '')
      return a.order - b.order
    })
}

export function bindEvents(): void {
  api.on('data:changed', (snap: Snapshot) => useStore.setState(snap))
  api.on('toast', (text: string) => useStore.getState().toast('info', text))
  api.on('toast:warn', (text: string) => useStore.getState().toast('err', text))
  api.on('vault:locked', (status: VaultStatus | undefined) =>
    useStore.setState({
      vault: status ?? { ...(useStore.getState().vault ?? { initialized: true, mode: 'password' }), locked: true },
      ...emptySnapshot
    })
  )
  api.on('update:state', (u: UpdateState) => useStore.setState({ update: u }))
}
