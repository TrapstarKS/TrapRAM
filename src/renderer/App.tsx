import { useEffect } from 'react'
import { Play, Gamepad2, Server, Lock, Shield, Gauge, Settings2 } from 'lucide-react'
import { bindEvents, useStore, type Tab } from './store'
import { Button } from './components/ui'
import { api } from './lib/api'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import LaunchPanel from './components/LaunchPanel'
import GamesPanel from './components/GamesPanel'
import ServersPanel from './components/ServersPanel'
import PrivateServersPanel from './components/PrivateServersPanel'
import PerformancePanel from './components/PerformancePanel'
import SettingsPanel from './components/SettingsPanel'
import LockScreen from './components/LockScreen'
import Toasts from './components/Toasts'
import UpdateBanner from './components/UpdateBanner'

const TABS: { id: Tab; label: string; icon: typeof Gamepad2 }[] = [
  { id: 'launch', label: 'Launch', icon: Play },
  { id: 'games', label: 'Games', icon: Gamepad2 },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'private', label: 'Private servers', icon: Shield },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'settings', label: 'Settings', icon: Settings2 }
]

export default function App() {
  const { vault, settings, tab, setTab, hydrate, startupError, run } = useStore()

  useEffect(() => {
    const unbind = bindEvents()
    void hydrate()
    void api.call('update:state').then((u) => useStore.setState({ update: u as never })).catch(() => undefined)
    return unbind
  }, [hydrate])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 'f') {
        e.preventDefault()
        document.getElementById('account-search')?.focus()
      }
      if (meta && e.key === 'l') {
        e.preventDefault()
        void run('Locking vault', () => api.call('vault:lock'))
      }
      if (meta && e.key >= '1' && e.key <= '6') {
        e.preventDefault()
        setTab(TABS[Number(e.key) - 1].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTab, run])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    let frame = 0
    const root = document.documentElement
    const apply = () => {
      const theme = settings?.theme === 'system' ? (media.matches ? 'light' : 'dark') : settings?.theme ?? 'dark'
      if (root.dataset.theme === theme) return
      root.classList.add('theme-changing')
      root.dataset.theme = theme
      void root.offsetHeight
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => root.classList.remove('theme-changing'))
    }
    apply()
    media.addEventListener('change', apply)
    return () => { media.removeEventListener('change', apply); cancelAnimationFrame(frame); root.classList.remove('theme-changing') }
  }, [settings?.theme])

  if (!vault || !settings) {
    return <div className="flex h-full flex-col"><TitleBar bare /><main className="grid flex-1 place-items-center p-6"><div className="text-center" role="status">
      <h1 className="text-xl font-semibold">{startupError ? 'Could not open TrapRAM' : 'Opening your workspace…'}</h1>
      {startupError && <><p className="my-3 text-[var(--color-dim)]">{startupError}</p><Button onClick={() => void hydrate()}>Try again</Button></>}
    </div></main></div>
  }

  if (vault.locked) {
    return (
      <>
        <TitleBar bare />
        <LockScreen status={vault} />
        <Toasts />
      </>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <TitleBar />
      <UpdateBanner />
      <div className="app-workspace flex min-h-0 flex-1 gap-3 px-3 pb-3">
        <Sidebar />
        <main id="main-content" tabIndex={-1} className="main-panel panel flex min-w-0 flex-1 flex-col overflow-hidden">
          <nav className="section-nav flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-2" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} data-active={tab === t.id} onClick={() => setTab(t.id)}>
                <t.icon size={14} strokeWidth={1.75} />
                {t.label}
              </button>
            ))}
            <div className="ml-auto">
              <button className="tab" onClick={() => void run('Locking vault', () => api.call('vault:lock'))} title="Lock vault (⌘/Ctrl+L)">
                <Lock size={14} strokeWidth={1.75} />
                Lock
              </button>
            </div>
          </nav>
          <div className="main-scroll min-h-0 flex-1 overflow-y-auto">
            <div className="page-heading">
              <p className="text-[12px] font-medium text-[var(--color-faint)]">Roblox workspace</p>
              <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.035em]">{tab === 'launch' ? 'Ready when you are.' : TABS.find(t => t.id === tab)?.label}</h1>
              <p className="mt-1 text-[13px] text-[var(--color-dim)]">{{ launch: 'Choose your accounts, pick an experience, and jump in.', games: 'Find your next experience. Keep favourites a click away.', servers: 'Find a public server for your selected accounts.', private: 'Keep your private servers together and rejoin with ease.', performance: 'See what is running and manage your Roblox clients.', settings: 'Make this workspace work for you.' }[tab]}</p>
            </div>
            {tab === 'launch' && <LaunchPanel />}
            {tab === 'games' && <GamesPanel />}
            {tab === 'servers' && <ServersPanel />}
            {tab === 'private' && <PrivateServersPanel />}
            {tab === 'performance' && <PerformancePanel />}
            {tab === 'settings' && <SettingsPanel />}
          </div>
        </main>
      </div>
      <Toasts />
    </div>
  )
}
