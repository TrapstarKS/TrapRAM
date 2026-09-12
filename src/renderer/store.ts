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
  startupError: string | null
  launching: boolean

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
  launch: <T>(label: string, fn: () => Promise<T>, success?: string) => Promise<T | undefined>
}

const emptySnapshot: Snapshot = { accounts: [], groups: [], presets: [], servers: [], withCookie: [] }
const operations = new Map<symbol, string>()
let hydration = 0

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
  startupError: null,
  launching: false,

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
    set({ toasts: [...get().toasts, { id, kind, text }] })
    if (kind !== 'err') setTimeout(() => get().dismiss(id), 5000)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setBusy: (busy) => set({ busy }),

  hydrate: async () => {
    const version = ++hydration
    set({ startupError: null })
    try {
      const [vault, settings] = await Promise.all([api.call<VaultStatus>('vault:status'), getSettings()])
      if (version !== hydration) return
      set({ vault, settings })
      if (!vault.locked) {
        const snap = await getData()
        if (version === hydration) set({ ...snap, selected: get().selected.filter(id => snap.accounts.some(a => a.userId === id)) })
      }
    } catch (error) {
      if (version !== hydration) return
      set({ vault: null, settings: null, startupError: error instanceof Error ? error.message : 'Please try again.' })
    }
  },

  patchSettings: async (patch) => {
    try {
      const settings = await api.call<Settings>('settings:set', patch)
      set({ settings })
    } catch (error) {
      get().toast('err', `Could not save settings. ${error instanceof Error ? error.message : 'Try again.'}`)
    }
  },

  run: async (label, fn, success) => {
    const operation = Symbol(label)
    operations.set(operation, label)
    set({ busy: label })
    try {
      const value = await fn()
      if (success) get().toast('ok', success)
      return value
    } catch (e) {
      get().toast('err', e instanceof Error ? e.message : String(e))
      return undefined
    } finally {
      operations.delete(operation)
      set({ busy: [...operations.values()].at(-1) ?? null })
    }
  },
  launch: async (label, fn, success) => {
    if (get().launching) return undefined
    set({ launching: true })
    try { return await get().run(label, fn, success) }
    finally { set({ launching: false }) }
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

export function readyAccounts(s: Pick<State, 'accounts' | 'selected' | 'withCookie'>): Account[] {
  return s.accounts.filter(a => s.selected.includes(a.userId) && !a.cookieExpired && s.withCookie.includes(a.userId))
}

export function bindEvents(): () => void {
  const off = [api.on('data:changed', (snap: Snapshot) => {
    if (useStore.getState().vault?.locked) return
    useStore.setState(s => ({ ...snap, selected: s.selected.filter(id => snap.accounts.some(a => a.userId === id)), groupFilter: snap.groups.some(g => g.name === s.groupFilter) ? s.groupFilter : '' }))
  }),
  api.on('toast', (text: string) => useStore.getState().toast('info', text)),
  api.on('toast:warn', (text: string) => useStore.getState().toast('err', text)),
  api.on('vault:locked', (status: VaultStatus | undefined) => {
    hydration++
    useStore.setState({
      vault: status ?? { ...(useStore.getState().vault ?? { initialized: true, mode: 'password' }), locked: true },
      selected: [], query: '', groupFilter: '', toasts: [], tab: 'launch',
      ...emptySnapshot
    })
  }),
  api.on('update:state', (u: UpdateState) => useStore.setState({ update: u }))]
  return () => off.forEach(unsubscribe => unsubscribe())
}
