import { useEffect, useRef, useState } from 'react'
import {
  Search,
  Plus,
  Globe,
  ClipboardPaste,
  QrCode,
  MoreHorizontal,
  RefreshCw,
  Pin,
  PinOff,
  Trash2,
  Pencil,
  Copy,
  Users,
  UserPlus,
  ShieldAlert,
  KeyRound,
  TimerReset,
  AtSign,
  Lock,
  LogIn,
  ListPlus,
  Loader2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'
import type { Account, BulkImportResult, BulkLoginResult } from '@shared/types'
import { reorderIds, editTargets, quickCode, utcMillis, parseBulkLines, type BulkLine } from '@shared/plain'
import { useStore, visibleAccounts } from '../store'
import { api, presenceColor, presenceLabel, relative } from '../lib/api'
import { Button, IconButton, Input, Label, Modal, Empty, Switch } from './ui'

export default function Sidebar() {
  const store = useStore()
  const { accounts, selected, query, groupFilter, groups, settings, withCookie, select, run, toast } = store
  const list = visibleAccounts(store)
  const [addOpen, setAddOpen] = useState(false)
  const [cookieOpen, setCookieOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [multiOpen, setMultiOpen] = useState(false)
  const [deviceOpen, setDeviceOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [quickFor, setQuickFor] = useState<Account | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const dragId = useRef<number | null>(null)

  const anonymize = settings?.anonymize ?? false

  async function addByLogin() {
    setAddOpen(false)
    const acc = await run('Waiting for sign-in', () => api.call<Account | null>('account:addLogin'))
    if (acc) toast('ok', `Added ${acc.username}`)
    else if (acc === null) toast('info', 'Sign-in window closed')
  }

  const manual = (settings?.sortMode ?? 'custom') === 'custom'

  async function reorder(targetId: number) {
    const from = dragId.current
    dragId.current = null
    if (from === null || !manual) return
    const ids = [...accounts].sort((a, b) => a.order - b.order).map((a) => a.userId)
    const next = reorderIds(ids, from, targetId)
    if (next) await run('Reordering', () => api.call('account:reorder', next))
  }

  return (
    <aside className="panel flex w-[292px] shrink-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-2 border-b px-3 py-2.5">
        <div className="relative">
          <Search
            size={14}
            strokeWidth={1.75}
            className="pointer-events-none absolute inset-y-0 my-auto ms-2.5 text-[var(--color-faint)]"
          />
          <Input
            id="account-search"
            placeholder="Search accounts"
            className="!ps-8 !h-[30px] !text-[12.5px]"
            value={query}
            onChange={(e) => store.setQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="primary" className="!h-[30px] flex-1 !text-[12px]" onClick={() => setAddOpen(true)}>
            <Plus size={14} strokeWidth={2.25} />
            Add account
          </Button>
          <IconButton
            label="Refresh presence and avatars"
            className="!h-[30px] !w-[30px]"
            onClick={() => void run('Refreshing', () => api.call('account:refresh'))}
          >
            <RefreshCw size={14} strokeWidth={1.75} />
          </IconButton>
        </div>

        {groups.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <GroupChip active={!groupFilter} onClick={() => store.setGroupFilter('')} color="var(--color-faint)">
              All
            </GroupChip>
            {groups.map((g) => (
              <GroupChip
                key={g.name}
                active={groupFilter === g.name}
                onClick={() => store.setGroupFilter(groupFilter === g.name ? '' : g.name)}
                color={g.color}
              >
                {g.name}
              </GroupChip>
            ))}
          </div>
        )}
      </div>

      {selected.length > 1 && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-[var(--color-accent-soft)] px-3 py-1.5 text-[11.5px]">
          <Users size={13} strokeWidth={1.75} style={{ color: 'var(--color-accent-text)' }} />
          <span className="num font-semibold">{selected.length} selected</span>
          <button
            className="ms-auto text-[var(--color-dim)] hover:text-[var(--color-text)]"
            onClick={store.clearSelection}
          >
            Clear
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5" onClick={(e) => e.target === e.currentTarget && setMenuFor(null)}>
        {list.length === 0 ? (
          <Empty
            icon={<UserPlus size={18} strokeWidth={1.75} />}
            title={accounts.length ? 'No matches' : 'No accounts yet'}
            hint={
              accounts.length
                ? 'Try a different name, alias, group or user ID.'
                : 'Sign in through the built-in browser and TrapRAM stores the session for you.'
            }
          />
        ) : (
          list.map((a, i) => (
            <div key={a.userId} className="relative">
              <div
                role="button"
                tabIndex={0}
                draggable={manual}
                onDragStart={() => (dragId.current = a.userId)}
                onDragOver={(e) => manual && e.preventDefault()}
                onDrop={() => void reorder(a.userId)}
                className="row"
                data-selected={selected.includes(a.userId)}
                onClick={(e) => select(a.userId, e.metaKey || e.ctrlKey ? 'toggle' : e.shiftKey ? 'range' : 'only')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    select(a.userId)
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenuFor(a.userId)
                }}
              >
                <Avatar account={a} anonymize={anonymize} index={i} hasCookie={withCookie.includes(a.userId)} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-semibold">
                      {anonymize ? `Account ${i + 1}` : a.alias || a.username}
                    </span>
                    {a.pinned && <Pin size={10} strokeWidth={2.25} className="shrink-0 text-[var(--color-faint)]" />}
                    {a.cookieExpired && (
                      <span title="Session expired — sign in again">
                        <KeyRound size={11} strokeWidth={2.25} style={{ color: 'var(--color-warn)' }} />
                      </span>
                    )}
                    {a.moderation && (
                      <span title={a.moderation.reason ?? 'Account is moderated'}>
                        <ShieldAlert size={11} strokeWidth={2.25} style={{ color: 'var(--color-bad)' }} />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-faint)]">
                    <span
                      className="h-[6px] w-[6px] shrink-0 rounded-full"
                      style={{ background: presenceColor(a.presence.type) }}
                    />
                    <span className="truncate">
                      {a.presence.type === 2 && a.presence.lastLocation
                        ? a.presence.lastLocation
                        : presenceLabel(a.presence.type)}
                    </span>
                  </div>
                </div>

                <button
                  aria-label={`Actions for ${a.alias || a.username}`}
                  className="shrink-0 rounded p-1 text-[var(--color-faint)] opacity-0 transition-opacity duration-150 ease-[var(--ease-out)] group-hover:opacity-100 hover:text-[var(--color-text)] focus-visible:opacity-100 [.row:hover_&]:opacity-100"
                  style={menuFor === a.userId ? ({ anchorName: '--row-menu' } as React.CSSProperties) : undefined}
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuFor(menuFor === a.userId ? null : a.userId)
                  }}
                >
                  <MoreHorizontal size={15} strokeWidth={2} />
                </button>
              </div>

              {menuFor === a.userId && (
                <RowMenu
                  account={a}
                  onClose={() => setMenuFor(null)}
                  onEdit={() => {
                    setMenuFor(null)
                    setEditing(a)
                  }}
                  onQuickLogin={() => {
                    setMenuFor(null)
                    setQuickFor(a)
                  }}
                />
              )}
            </div>
          ))
        )}
      </div>

      <Modal
        open={addOpen}
        title="Add an account"
        description="Signing in through TrapRAM's browser keeps the session out of your everyday browser profile."
        onClose={() => setAddOpen(false)}
      >
        <div className="grid gap-2">
          <BigChoice
            icon={<Globe size={17} strokeWidth={1.75} />}
            title="Sign in with the built-in browser"
            hint="Opens an isolated, throwaway Chromium session. TrapRAM reads the session cookie and the password you type, keeps both in the encrypted vault, and wipes the window. Shift+click to open several at once."
            onClick={(e) => {
              if (e.shiftKey) {
                setAddOpen(false)
                setMultiOpen(true)
              } else {
                void addByLogin()
              }
            }}
          />
          <BigChoice
            icon={<QrCode size={17} strokeWidth={1.75} />}
            title="Approve on your phone"
            hint="Scan a QR code with the Roblox app and approve. No password, no cookie to paste."
            onClick={() => {
              setAddOpen(false)
              setDeviceOpen(true)
            }}
          />
          <BigChoice
            icon={<ClipboardPaste size={17} strokeWidth={1.75} />}
            title="Paste a .ROBLOSECURITY cookie"
            hint="For migrating from another manager."
            onClick={() => {
              setAddOpen(false)
              setCookieOpen(true)
            }}
          />
          <BigChoice
            icon={<ListPlus size={17} strokeWidth={1.75} />}
            title="Bulk import"
            hint="Paste a list — one cookie or one username:password per line."
            onClick={() => {
              setAddOpen(false)
              setBulkOpen(true)
            }}
          />
        </div>
      </Modal>

      <CookieModal open={cookieOpen} onClose={() => setCookieOpen(false)} />
      <BulkImportModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
      <MultiLoginModal open={multiOpen} onClose={() => setMultiOpen(false)} />
      <DeviceLoginModal open={deviceOpen} onClose={() => setDeviceOpen(false)} />
      <EditModal account={editing} onClose={() => setEditing(null)} />
      <QuickLoginModal account={quickFor} onClose={() => setQuickFor(null)} />
    </aside>
  )
}

function Avatar({
  account,
  anonymize,
  index,
  hasCookie
}: {
  account: Account
  anonymize: boolean
  index: number
  hasCookie: boolean
}) {
  const initials = anonymize ? String(index + 1) : (account.alias || account.username).slice(0, 2).toUpperCase()
  const bad = account.cookieExpired || !hasCookie
  const label = bad ? (hasCookie ? 'Session expired' : 'No stored session') : 'Session valid'

  return (
    <div className="relative shrink-0">
      {account.avatarUrl && !anonymize ? (
        <img
          src={account.avatarUrl}
          alt=""
          width={30}
          height={30}
          className="avatar h-[30px] w-[30px] rounded-full bg-[var(--color-raised)] object-cover"
          loading="lazy"
        />
      ) : (
        <div className="avatar grid h-[30px] w-[30px] place-items-center rounded-full bg-[var(--color-raised)] text-[11px] font-bold text-[var(--color-dim)]">
          {initials}
        </div>
      )}
      <span
        role="img"
        aria-label={label}
        title={label}
        className="absolute -bottom-px -end-px h-[10px] w-[10px] rounded-full"
        style={{
          background: bad ? 'var(--color-bad)' : 'var(--color-info)',
          boxShadow: '0 0 0 2px var(--color-surface)'
        }}
      />
    </div>
  )
}

function GroupChip({
  children,
  active,
  onClick,
  color
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
  color: string
}) {
  return (
    <button
      onClick={onClick}
      className="chip transition-[background-color,box-shadow] duration-150 ease-[var(--ease-out)]"
      style={{
        background: active ? `color-mix(in oklch, ${color} 22%, transparent)` : 'var(--color-raised)',
        color: active ? color : 'var(--color-dim)',
        boxShadow: active ? `inset 0 0 0 1px color-mix(in oklch, ${color} 45%, transparent)` : 'none'
      }}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}

function BigChoice({
  icon,
  title,
  hint,
  onClick
}: {
  icon: React.ReactNode
  title: string
  hint: string
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 rounded-[10px] bg-[var(--color-raised)] p-3 text-start transition-[background-color,scale] duration-150 ease-[var(--ease-out)] hover:bg-[var(--color-hover)] active:scale-[0.98]"
    >
      <span className="mt-0.5 text-[var(--color-accent-text)]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">{title}</span>
        <span className="block text-[11.5px] leading-snug text-[var(--color-dim)]">{hint}</span>
      </span>
    </button>
  )
}

function RowMenu({
  account,
  onClose,
  onEdit,
  onQuickLogin
}: {
  account: Account
  onClose: () => void
  onEdit: () => void
  onQuickLogin: () => void
}) {
  const { run, settings, toast } = useStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.showPopover()
  }, [])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const arm = setTimeout(() => document.addEventListener('mousedown', close))
    document.addEventListener('keydown', esc)
    return () => {
      clearTimeout(arm)
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  const item = (icon: React.ReactNode, label: string, fn: () => void, danger?: boolean) => (
    <button
      className="flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-start text-[12px] transition-colors duration-100 hover:bg-[var(--color-hover)]"
      style={danger ? { color: 'var(--color-bad)' } : undefined}
      onClick={() => {
        onClose()
        fn()
      }}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div
      ref={ref}
      popover="manual"
      className="panel rise w-[214px] border-0 p-1 text-[var(--color-text)]"
      style={
        {
          animationDuration: '140ms',
          margin: 0,
          inset: 'auto',
          positionAnchor: '--row-menu',
          positionArea: 'block-end span-inline-start',
          positionTryFallbacks: 'flip-block'
        } as React.CSSProperties
      }
      role="menu"
    >
      {item(<Globe size={13} strokeWidth={1.75} />, 'Open browser as this account', () =>
        run('Opening browser', () => api.call('account:browse', account.userId))
      )}
      {item(<LogIn size={13} strokeWidth={1.75} />, 'Quick log in with a code', onQuickLogin)}
      {item(<RefreshCw size={13} strokeWidth={1.75} />, 'Revalidate session', () =>
        run('Checking session', () => api.call('account:revalidate', [account.userId]), 'Session checked')
      )}
      {item(<TimerReset size={13} strokeWidth={1.75} />, 'Renew session cookie', () =>
        run('Renewing session', () =>
          api.call<{ renewed: number; skipped: number }>('account:refreshCookies', [account.userId])
        ).then(
          (r) =>
            r &&
            toast(
              r.skipped ? 'err' : r.renewed ? 'ok' : 'info',
              r.skipped
                ? 'Left alone — this account was added from another country. Turn the VPN off, or paste its cookie again from here.'
                : r.renewed
                  ? 'Session renewed'
                  : 'Roblox kept the current session'
            )
        )
      )}
      {item(<Pencil size={13} strokeWidth={1.75} />, 'Edit alias, group, note', onEdit)}
      {item(
        account.pinned ? <PinOff size={13} strokeWidth={1.75} /> : <Pin size={13} strokeWidth={1.75} />,
        account.pinned ? 'Unpin' : 'Pin to top',
        () => run('Saving', () => api.call('account:update', account.userId, { pinned: !account.pinned }))
      )}
      <div className="my-1 h-px bg-[var(--color-line)]" />
      {item(<AtSign size={13} strokeWidth={1.75} />, 'Copy username', () => {
        void navigator.clipboard.writeText(account.username)
        toast('ok', 'Username copied')
      })}
      {account.password &&
        item(<Lock size={13} strokeWidth={1.75} />, 'Copy password (clears in 45s)', () =>
          run(
            'Copying',
            () => api.call('account:copyPassword', account.userId),
            'Password copied — clipboard clears in 45s'
          )
        )}
      {!settings?.hideCookieActions &&
        item(<Copy size={13} strokeWidth={1.75} />, 'Copy cookie (clears in 45s)', () =>
          run('Copying', () => api.call('account:copyCookie', account.userId), 'Cookie copied — clipboard clears in 45s')
        )}
      {item(<Trash2 size={13} strokeWidth={1.75} />, 'Remove account', () => {
        if (!confirm(`Remove ${account.alias || account.username} from TrapRAM?`)) return
        void run('Removing', () => api.call('account:remove', account.userId)).then(() =>
          toast('ok', 'Account removed')
        )
      }, true)}
    </div>
  )
}

function CookieModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run, toast } = useStore()
  const [value, setValue] = useState('')

  async function submit() {
    const acc = await run('Validating cookie', () => api.call<Account>('account:addCookie', value))
    if (acc) {
      toast('ok', `Added ${acc.username}`)
      setValue('')
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      title="Paste a session cookie"
      description="The value of .ROBLOSECURITY. It is encrypted before it reaches the disk."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={value.trim().length < 100} onClick={() => void submit()}>
            Add account
          </Button>
        </>
      }
    >
      <textarea
        className="field h-[110px] resize-none py-2 font-mono text-[11px] leading-relaxed"
        placeholder="_|WARNING:-DO-NOT-SHARE-THIS…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
      />
    </Modal>
  )
}

type BulkRow = { id: string; label: string; status: 'pending' | 'ok' | 'err'; detail?: string }

function BulkImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useStore()
  const [text, setText] = useState('')
  const [group, setGroup] = useState('')
  const [rows, setRows] = useState<BulkRow[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setText('')
      setGroup('')
      setRows([])
    }
  }, [open])

  useEffect(
    () =>
      api.on('bulkLogin:result', (r: BulkLoginResult) => {
        setRows((prev) =>
          prev.map((row) =>
            row.id === `cred:${r.index}`
              ? {
                  ...row,
                  status: r.ok ? 'ok' : 'err',
                  detail: r.ok
                    ? r.skipped
                      ? `Already signed in as ${r.account?.username}`
                      : `Added ${r.account?.username}`
                    : r.error
                }
              : row
          )
        )
        if (r.ok && !r.skipped) toast('ok', `Added ${r.account?.username}`)
        if (r.ok && r.account && group.trim()) void api.call('account:update', [r.account.userId], { group: group.trim() })
      }),
    [toast, group]
  )

  const parsed = parseBulkLines(text)
  const cookieLines = parsed
    .filter((l): l is Extract<BulkLine, { kind: 'cookie' }> => l.kind === 'cookie')
    .slice(0, 50)
  const seenUsers = new Set<string>()
  const credLines = parsed
    .filter((l): l is Extract<BulkLine, { kind: 'credential' }> => l.kind === 'credential')
    .filter((l) => {
      const key = l.username.toLowerCase()
      if (seenUsers.has(key)) return false
      seenUsers.add(key)
      return true
    })
  const skipped = parsed.length - cookieLines.length - credLines.length

  async function submit() {
    setBusy(true)
    setRows([
      ...cookieLines.map((l, i) => ({ id: `cookie:${i}`, label: `Cookie #${i + 1}`, status: 'pending' as const })),
      ...credLines.map((l, i) => ({ id: `cred:${i}`, label: l.username, status: 'pending' as const }))
    ])

    if (credLines.length) {
      try {
        await api.call(
          'login:bulkOpen',
          credLines.map((l) => ({ username: l.username, password: l.password })),
          undefined,
          5
        )
      } catch (e) {
        toast('err', e instanceof Error ? e.message : String(e))
      }
    }

    if (cookieLines.length) {
      try {
        const res = await api.call<BulkImportResult[]>(
          'account:bulkImportCookies',
          cookieLines.map((l) => l.value)
        )
        setRows((prev) => {
          const next = [...prev]
          res.forEach((r, i) => {
            const idx = next.findIndex((row) => row.id === `cookie:${i}`)
            if (idx < 0) return
            next[idx] = {
              ...next[idx],
              label: r.username ?? next[idx].label,
              status: r.ok ? 'ok' : 'err',
              detail: r.ok ? `Added ${r.username}` : r.error
            }
          })
          return next
        })
        if (group.trim()) {
          const ids = res.filter((r) => r.ok && r.account).map((r) => r.account!.userId)
          if (ids.length) await api.call('account:update', ids, { group: group.trim() })
        }
      } catch (e) {
        toast('err', e instanceof Error ? e.message : String(e))
      }
    }
    setBusy(false)
    setText('')
  }

  return (
    <Modal
      open={open}
      title="Bulk import"
      description="One per line. A long value is treated as a cookie; username:password opens a real sign-in window per line."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={busy || (!cookieLines.length && !credLines.length)}
            onClick={() => void submit()}
          >
            Import {parsed.length ? cookieLines.length + credLines.length : ''}
          </Button>
        </>
      }
    >
      <textarea
        aria-label="Accounts to import"
        className="field h-[110px] resize-none py-2 font-mono text-[11px] leading-relaxed"
        placeholder={'_|WARNING:-DO-NOT-SHARE-THIS…\nusername:password'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      {skipped > 0 && (
        <p className="mt-1.5 text-[11px] text-[var(--color-faint)]">
          {skipped} line{skipped === 1 ? '' : 's'} skipped — at most 50 cookies and 10 username:password logins at
          once.
        </p>
      )}
      <div className="mt-3">
        <GroupField value={group} onChange={setGroup} hint="Every account this imports goes into this group." />
      </div>
      <StatusRows rows={rows} />
    </Modal>
  )
}

function GroupField({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint?: string }) {
  const { groups } = useStore()
  return (
    <div>
      <Label hint={hint}>Group</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} list="group-options" placeholder="Ungrouped" />
      <datalist id="group-options">
        {groups.map((g) => (
          <option key={g.name} value={g.name} />
        ))}
      </datalist>
    </div>
  )
}

function StatusRows({ rows }: { rows: BulkRow[] }) {
  if (!rows.length) return null
  return (
    <div className="mt-2.5 grid max-h-[168px] gap-1 overflow-y-auto">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-center gap-2 rounded-[6px] bg-[var(--color-raised)] px-2.5 py-1.5 text-[11.5px]"
        >
          {row.status === 'pending' ? (
            <Loader2
              aria-hidden="true"
              size={13}
              strokeWidth={1.75}
              className="shrink-0 animate-spin text-[var(--color-faint)]"
            />
          ) : row.status === 'ok' ? (
            <CheckCircle2
              aria-hidden="true"
              size={13}
              strokeWidth={1.75}
              className="shrink-0"
              style={{ color: 'var(--color-ok)' }}
            />
          ) : (
            <AlertTriangle
              aria-hidden="true"
              size={13}
              strokeWidth={1.75}
              className="shrink-0"
              style={{ color: 'var(--color-bad)' }}
            />
          )}
          <span className="min-w-0 flex-1 truncate">{row.label}</span>
          {row.detail && (
            <span className="max-w-[55%] shrink-0 truncate text-[var(--color-faint)]" title={row.detail}>
              {row.detail}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function MultiLoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useStore()
  const [count, setCount] = useState(2)
  const [inject, setInject] = useState(false)
  const [js, setJs] = useState('')
  const [group, setGroup] = useState('')
  const [rows, setRows] = useState<BulkRow[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setRows([])
      setBusy(false)
      setInject(false)
      setJs('')
      setGroup('')
    }
  }, [open])

  useEffect(
    () =>
      api.on('bulkLogin:result', (r: BulkLoginResult) => {
        setRows((prev) =>
          prev.map((row) =>
            row.id === `win:${r.index}`
              ? {
                  ...row,
                  label: r.username ?? row.label,
                  status: r.ok ? 'ok' : 'err',
                  detail: r.ok ? `Added ${r.account?.username}` : r.error
                }
              : row
          )
        )
        if (r.ok) toast('ok', `Added ${r.account?.username}`)
        if (r.ok && r.account && group.trim()) void api.call('account:update', [r.account.userId], { group: group.trim() })
      }),
    [toast, group]
  )

  async function submit() {
    setBusy(true)
    setRows(
      Array.from({ length: count }, (_, i) => ({
        id: `win:${i}`,
        label: `Browser ${i + 1}`,
        status: 'pending' as const
      }))
    )
    try {
      await api.call(
        'login:bulkOpen',
        Array.from({ length: count }, () => ({})),
        inject ? js : undefined
      )
    } catch (e) {
      toast('err', e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  return (
    <Modal
      open={open}
      title="Open several sign-ins"
      description="Opens that many blank sign-in windows, tiled like TrapRAM arranges game windows. Sign in to each by hand."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" loading={busy} disabled={busy} onClick={() => void submit()}>
            Open {count}
          </Button>
        </>
      }
    >
      <Label hint="Up to 10 at once.">Browsers to open</Label>
      <Input
        aria-label="Number of browsers to open"
        type="number"
        min={1}
        max={10}
        value={count}
        onChange={(e) => setCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
        className="!w-20"
      />

      <div className="mt-4">
        <Switch
          checked={inject}
          onChange={setInject}
          label="Inject JavaScript into each window"
          hint="Runs in every window this opens, right as its page loads."
        />
      </div>

      {inject && (
        <textarea
          aria-label="JavaScript to inject"
          className="field mt-2 h-[110px] resize-none py-2 font-mono text-[11px] leading-relaxed"
          placeholder="console.log('injected')"
          value={js}
          onChange={(e) => setJs(e.target.value)}
          spellCheck={false}
        />
      )}

      <div className="mt-4">
        <GroupField value={group} onChange={setGroup} hint="Every account signed in here goes into this group." />
      </div>

      <StatusRows rows={rows} />
    </Modal>
  )
}

interface Ticket {
  code: string
  privateKey: string
  expirationTime: string
  qr: string
}

function DeviceLoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useStore()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [left, setLeft] = useState(0)
  const [error, setError] = useState('')
  const [linked, setLinked] = useState<string | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const issue = () => {
    setError('')
    setLinked(null)
    setTicket(null)
    void api
      .call<Ticket>('login:create')
      .then(setTicket)
      .catch((e: Error) => setError(e.message))
  }

  useEffect(() => {
    if (open) issue()
    else setTicket(null)
  }, [open])

  useEffect(() => {
    if (!ticket) return
    const deadline = utcMillis(ticket.expirationTime)
    let alive = true

    const tick = setInterval(() => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 500)

    const poll = async () => {
      let failures = 0
      while (alive) {
        await new Promise((r) => setTimeout(r, 2500))
        if (!alive) return
        if (Date.now() > deadline) {
          setError('That code expired before it was approved')
          return
        }
        try {
          const r = await api.call<{ status: string; accountName: string | null; account: Account | null }>(
            'login:poll',
            ticket.code,
            ticket.privateKey
          )
          if (!alive) return
          failures = 0
          setLinked(r.accountName)
          if (r.status === 'Cancelled') {
            setError('That code was turned down on the phone')
            return
          }
          if (r.account) {
            toast('ok', `Added ${r.account.username}`)
            closeRef.current()
            return
          }
        } catch (e) {
          if (!alive) return
          if (++failures >= 3) {
            setError(e instanceof Error ? e.message : String(e))
            return
          }
        }
      }
    }
    void poll()

    return () => {
      alive = false
      clearInterval(tick)
    }
  }, [ticket, toast])

  return (
    <Modal
      open={open}
      title="Approve on your phone"
      description="Open Roblox on your phone, go to log in, pick “Another device”, then scan this or type the code."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={issue} disabled={!!ticket && left > 0}>
            New code
          </Button>
        </>
      }
    >
      {error ? (
        <div className="rounded-[8px] p-3 text-[12.5px]" style={{ background: 'oklch(0.65 0.208 24 / 0.12)', color: 'var(--color-bad)' }}>
          {error}
        </div>
      ) : !ticket ? (
        <div className="grid h-[232px] place-items-center text-[12.5px] text-[var(--color-faint)]">
          Asking Roblox for a code…
        </div>
      ) : (
        <div className="grid justify-items-center gap-2.5">
          {ticket.qr && <img src={ticket.qr} alt="" width={168} height={168} className="rounded-[8px] bg-white p-2" />}
          <div className="num text-[24px] font-bold tracking-[0.3em]">{ticket.code}</div>
          <div className="text-[11.5px] text-[var(--color-faint)]">
            {left <= 0 ? 'Expired' : linked ? `Waiting for ${linked} to approve · ${left}s` : `Expires in ${left}s`}
          </div>
        </div>
      )}
    </Modal>
  )
}

function QuickLoginModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { run, toast } = useStore()
  const [code, setCode] = useState('')
  const [pending, setPending] = useState<{ code: string; deviceInfo?: string; location?: string } | null>(null)

  useEffect(() => {
    setCode('')
    setPending(null)
  }, [account])

  if (!account) return null
  const who = account.alias || account.username

  const check = async () => {
    const clean = quickCode(code)
    if (!clean) return toast('err', 'A quick login code is 6 characters')
    const info = await run('Checking the code', () =>
      api.call<{ deviceInfo?: string; location?: string }>('account:quickLoginCode', account.userId, clean)
    )
    if (info) setPending({ code: clean, ...info })
  }

  const approve = () =>
    void run('Approving', () => api.call('account:quickLoginConfirm', account.userId, pending!.code)).then((ok) => {
      if (!ok) return
      toast('ok', `That device is now signed in as ${who}`)
      onClose()
    })

  return (
    <Modal
      open
      title={`Quick log in as ${who}`}
      description={
        pending
          ? 'Approve only if this is the device you are holding.'
          : 'Type the 6-character code Roblox is showing on the other device. Never enter a code someone sent you — it signs them in as you.'
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {pending ? (
            <Button variant="primary" onClick={approve}>
              Yes, that is me
            </Button>
          ) : (
            <Button variant="primary" disabled={!quickCode(code)} onClick={() => void check()}>
              Check code
            </Button>
          )}
        </>
      }
    >
      {pending ? (
        <div className="grid gap-1.5 rounded-[8px] bg-[var(--color-raised)] p-3 text-[12.5px]">
          <Row label="Device" value={pending.deviceInfo ?? 'Unknown'} />
          <Row label="Location" value={pending.location ?? 'Unknown'} />
          <Row label="Code" value={pending.code} />
        </div>
      ) : (
        <Input
          className="num !h-[44px] text-center !text-[20px] tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="ABC123"
          spellCheck={false}
          autoFocus
        />
      )}
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-[64px] shrink-0 text-[var(--color-faint)]">{label}</span>
      <span className="min-w-0 flex-1 break-words font-semibold">{value}</span>
    </div>
  )
}

function EditModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { run, selected } = useStore()
  const [alias, setAlias] = useState('')
  const [group, setGroup] = useState('')
  const [note, setNote] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (!account) return
    setAlias(account.alias)
    setGroup(account.group)
    setNote(account.note)
    setPassword(editTargets(account.userId, selected).length > 1 ? '' : (account.password ?? ''))
  }, [account])

  if (!account) return null

  const ids = editTargets(account.userId, selected)
  const many = ids.length > 1

  return (
    <Modal
      open
      title={many ? `${ids.length} accounts` : account.username}
      description={
        many
          ? 'Group, note, and password (if you set one) apply to all of them. Alias stays per account.'
          : `User ID ${account.userId} · added ${relative(account.addedAt)}${
              account.region ? ` from ${account.region}` : ''
            }`
      }
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() =>
              void run('Saving', () =>
                api.call(
                  'account:update',
                  ids,
                  many ? { group, note, ...(password ? { password } : {}) } : { alias, group, note, password }
                )
              ).then(onClose)
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {!many && (
          <div>
            <Label hint="Shown instead of the username">Alias</Label>
            <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder={account.username} />
          </div>
        )}
        <GroupField value={group} onChange={setGroup} hint="Type a new name to create a group" />
        <div>
          <Label>Note</Label>
          <textarea
            className="field h-[70px] resize-none py-2 text-[12.5px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything you want to remember about this account"
          />
        </div>
        <div>
          <Label hint="Kept in the encrypted vault — TrapRAM never signs in with it">Password</Label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={many ? 'Leave blank to keep each account’s own password' : 'Only if you want it here'}
            spellCheck={false}
          />
        </div>
        {account.moderation && (
          <div
            className="rounded-[8px] p-2.5 text-[11.5px] leading-snug"
            style={{ background: 'oklch(0.65 0.208 24 / 0.12)', color: 'var(--color-bad)' }}
          >
            {account.moderation.reason ?? 'This account is under moderation.'}
            {account.moderation.expiresAt ? ` Ends ${new Date(account.moderation.expiresAt).toLocaleString()}.` : ''}
          </div>
        )}
      </div>
    </Modal>
  )
}
