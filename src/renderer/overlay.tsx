import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowRight, RotateCw, X, House, ExternalLink, Puzzle, Code2 } from 'lucide-react'
import './index.css'

interface State {
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
  loading: boolean
}

declare global {
  interface Window {
    browser: {
      send(userId: number, action: string, arg?: string): void
      onState(fn: (s: State) => void): void
    }
  }
}

const params = new URLSearchParams(location.search)
const userId = Number(params.get('uid'))
const label = params.get('label') ?? 'Account'
const extensions = Number(params.get('ext') ?? 0)
const isMac = navigator.userAgent.includes('Mac')

function Toolbar() {
  const [state, setState] = useState<State>({ url: '', title: '', canGoBack: false, canGoForward: false, loading: false })
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    window.browser.onState((s) => {
      setState(s)
      if (!editing) setDraft(prettyUrl(s.url))
    })
  }, [editing])

  const send = (action: string, arg?: string) => window.browser.send(userId, action, arg)

  return (
    <div
      className="drag flex h-[46px] items-center gap-1.5 border-b bg-[var(--color-bg)] px-2"
      style={{ paddingInlineStart: isMac ? 80 : 8 }}
    >
      <NavButton label="Back" disabled={!state.canGoBack} onClick={() => send('back')}>
        <ArrowLeft size={15} strokeWidth={2} />
      </NavButton>
      <NavButton label="Forward" disabled={!state.canGoForward} onClick={() => send('forward')}>
        <ArrowRight size={15} strokeWidth={2} />
      </NavButton>
      <NavButton label={state.loading ? 'Stop' : 'Reload'} onClick={() => send('reload')}>
        {state.loading ? <X size={15} strokeWidth={2} /> : <RotateCw size={14} strokeWidth={2} />}
      </NavButton>
      <NavButton label="Home" onClick={() => send('home')}>
        <House size={15} strokeWidth={1.75} />
      </NavButton>

      <div className="no-drag relative min-w-0 flex-1">
        <input
          className="field !h-[30px] !text-[12px]"
          value={draft}
          spellCheck={false}
          aria-label="Address"
          onFocus={(e) => {
            setEditing(true)
            e.currentTarget.select()
          }}
          onBlur={() => {
            setEditing(false)
            setDraft(prettyUrl(state.url))
          }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              send('go', draft.trim())
              e.currentTarget.blur()
            }
            if (e.key === 'Escape') {
              setDraft(prettyUrl(state.url))
              e.currentTarget.blur()
            }
          }}
        />
      </div>

      <span className="no-drag flex items-center gap-1.5 rounded-[7px] bg-[var(--color-raised)] px-2 py-1 text-[11.5px] font-semibold">
        <span className="h-[6px] w-[6px] rounded-full bg-[var(--color-ok)]" />
        <span className="max-w-[130px] truncate">{label}</span>
      </span>

      {extensions > 0 && (
        <span
          className="no-drag flex items-center gap-1 rounded-[7px] bg-[var(--color-raised)] px-1.5 py-1 text-[11px] text-[var(--color-dim)]"
          title={`${extensions} extension${extensions === 1 ? '' : 's'} loaded`}
        >
          <Puzzle size={13} strokeWidth={1.75} />
          <span className="num">{extensions}</span>
        </span>
      )}

      <NavButton label="Developer tools" onClick={() => send('devtools')}>
        <Code2 size={14} strokeWidth={1.75} />
      </NavButton>
      <NavButton label="Open in system browser" onClick={() => send('external')}>
        <ExternalLink size={14} strokeWidth={1.75} />
      </NavButton>
    </div>
  )
}

function NavButton({
  children,
  label,
  onClick,
  disabled
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="no-drag btn btn-ghost h-[30px] w-[30px] !px-0"
    >
      {children}
    </button>
  )
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.host + (u.pathname === '/' ? '' : u.pathname) + u.search
  } catch {
    return url
  }
}

createRoot(document.getElementById('root')!).render(<Toolbar />)
