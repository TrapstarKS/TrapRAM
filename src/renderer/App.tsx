import { useEffect } from 'react'
import { Play, Gamepad2, Server, Lock, Shield, Gauge, Settings2 } from 'lucide-react'
import { bindEvents, useStore, type Tab } from './store'
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
  { id: 'private', label: 'Private', icon: Shield },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'settings', label: 'Settings', icon: Settings2 }
]

export default function App() {
  const { vault, settings, tab, setTab, hydrate } = useStore()

  useEffect(() => {
    bindEvents()
    void hydrate()
    void api.call('update:state').then((u) => useStore.setState({ update: u as never }))
  }, [hydrate])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 'f') {
        e.preventDefault()
        document.getElementById('account-search')?.focus()
      }
      if (meta && e.key === 'l') {
        e.preventDefault()
        void api.call('vault:lock')
      }
      if (meta && e.key >= '1' && e.key <= '6') {
        e.preventDefault()
        setTab(TABS[Number(e.key) - 1].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTab])

  if (!vault || !settings) {
    return <div className="grid h-full place-items-center text-[var(--color-faint)]">Starting…</div>
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
      <TitleBar />
      <UpdateBanner />
      <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
        <Sidebar />
        <main className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
          <nav className="flex shrink-0 items-center gap-1 border-b px-3 py-2" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.id} className="tab" data-active={tab === t.id} onClick={() => setTab(t.id)}>
                <t.icon size={14} strokeWidth={1.75} />
                {t.label}
              </button>
            ))}
            <div className="ml-auto">
              <button className="tab" onClick={() => void api.call('vault:lock')} title="Lock vault (⌘L)">
                <Lock size={14} strokeWidth={1.75} />
                Lock
              </button>
            </div>
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
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
