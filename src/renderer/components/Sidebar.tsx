import { useEffect, useRef, useState } from 'react'
import {
  Search,
  Plus,
  Globe,
  ClipboardPaste,
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
  TimerReset
} from 'lucide-react'
import type { Account } from '@shared/types'
import { reorderIds } from '@shared/order'
import { useStore, visibleAccounts } from '../store'
import { api, presenceColor, presenceLabel, relative } from '../lib/api'
import { Button, IconButton, Input, Label, Modal, Empty } from './ui'

export default function Sidebar() {
  const store = useStore()
  const { accounts, selected, query, groupFilter, groups, settings, withCookie, select, run, toast } = store
  const list = visibleAccounts(store)
  const [addOpen, setAddOpen] = useState(false)
  const [cookieOpen, setCookieOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
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
            hint="Opens an isolated, throwaway Chromium session. TrapRAM reads the session cookie and wipes the window."
            onClick={() => void addByLogin()}
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
        </div>
      </Modal>

      <CookieModal open={cookieOpen} onClose={() => setCookieOpen(false)} />
      <EditModal account={editing} onClose={() => setEditing(null)} />
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
  onClick: () => void
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

function RowMenu({ account, onClose, onEdit }: { account: Account; onClose: () => void; onEdit: () => void }) {
  const { run, settings, toast } = useStore()
  const ref = useRef<HTMLDivElement>(null)

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
      className="panel rise absolute end-2 top-[38px] z-30 w-[214px] p-1"
      style={{ animationDuration: '140ms' }}
      role="menu"
    >
      {item(<Globe size={13} strokeWidth={1.75} />, 'Open browser as this account', () =>
        run('Opening browser', () => api.call('account:browse', account.userId))
      )}
      {item(<RefreshCw size={13} strokeWidth={1.75} />, 'Revalidate session', () =>
        run('Checking session', () => api.call('account:revalidate', [account.userId]), 'Session checked')
      )}
      {item(<TimerReset size={13} strokeWidth={1.75} />, 'Renew session cookie', () =>
        run('Renewing session', () =>
          api.call<{ renewed: number }>('account:refreshCookies', [account.userId])
        ).then((r) => r && toast(r.renewed ? 'ok' : 'info', r.renewed ? 'Session renewed' : 'Roblox kept the current session'))
      )}
      {item(<Pencil size={13} strokeWidth={1.75} />, 'Edit alias, group, note', onEdit)}
      {item(
        account.pinned ? <PinOff size={13} strokeWidth={1.75} /> : <Pin size={13} strokeWidth={1.75} />,
        account.pinned ? 'Unpin' : 'Pin to top',
        () => run('Saving', () => api.call('account:update', account.userId, { pinned: !account.pinned }))
      )}
      <div className="my-1 h-px bg-[var(--color-line)]" />
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

function EditModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { run, groups } = useStore()
  const [alias, setAlias] = useState('')
  const [group, setGroup] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!account) return
    setAlias(account.alias)
    setGroup(account.group)
    setNote(account.note)
  }, [account])

  if (!account) return null

  return (
    <Modal
      open
      title={account.username}
      description={`User ID ${account.userId} · added ${relative(account.addedAt)}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() =>
              void run('Saving', () => api.call('account:update', account.userId, { alias, group, note })).then(onClose)
            }
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div>
          <Label hint="Shown instead of the username">Alias</Label>
          <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder={account.username} />
        </div>
        <div>
          <Label hint="Type a new name to create a group">Group</Label>
          <Input value={group} onChange={(e) => setGroup(e.target.value)} list="group-options" placeholder="Ungrouped" />
          <datalist id="group-options">
            {groups.map((g) => (
              <option key={g.name} value={g.name} />
            ))}
          </datalist>
        </div>
        <div>
          <Label>Note</Label>
          <textarea
            className="field h-[70px] resize-none py-2 text-[12.5px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything you want to remember about this account"
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
