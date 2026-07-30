import { useState } from 'react'
import { Shield, Plus, Trash2, Play } from 'lucide-react'
import type { PrivateServer } from '@shared/types'
import { useStore } from '../store'
import { api } from '../lib/api'
import { Button, Input, Label, Empty, Section, Modal } from './ui'

export default function PrivateServersPanel() {
  const { servers, selected, accounts, run, toast } = useStore()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [link, setLink] = useState('')
  const [saving, setSaving] = useState(false)

  const usable = accounts.filter((a) => selected.includes(a.userId) && !a.cookieExpired)

  async function add() {
    const code = extractShareCode(link)
    if (!code) return toast('err', 'Paste a full private server share link')
    if (!accounts.length) return toast('err', 'Add an account first — resolving the link needs a session')
    const who = usable[0] ?? accounts[0]

    setSaving(true)
    const resolved = await run('Resolving link', () =>
      api.call<{ placeId: number; universeId?: number; linkCode: string; accessCode: string }>(
        'share:resolve',
        who.userId,
        code
      )
    )
    if (!resolved) return setSaving(false)

    const meta = resolved.universeId
      ? await api.call<{ name: string; icon?: string }>('game:ping', resolved.placeId).catch(() => null)
      : null

    const server: PrivateServer = {
      id: '',
      name: name.trim() || meta?.name || `Private server ${resolved.placeId}`,
      placeId: resolved.placeId,
      universeId: resolved.universeId,
      linkCode: resolved.linkCode,
      accessCode: resolved.accessCode,
      gameName: meta?.name,
      iconUrl: meta?.icon
    }
    await run('Saving', () => api.call('server:save', server), 'Private server saved')
    setSaving(false)
    setOpen(false)
    setName('')
    setLink('')
  }

  async function join(s: PrivateServer) {
    if (!usable.length) return toast('err', 'Select at least one account')
    const failed = await run('Joining', () =>
      api.call<{ error: string }[]>(
        'launch:many',
        usable.map((a) => a.userId),
        { placeId: s.placeId, linkCode: s.linkCode, accessCode: s.accessCode }
      )
    )
    if (failed) toast(failed.length ? 'err' : 'ok', failed.length ? failed[0].error : `Joining ${s.name}`)
  }

  return (
    <div className="p-5">
      <Section
        title="Private servers"
        hint="Share links resolved once and saved — no browser needed to rejoin"
        actions={
          <Button variant="primary" className="!h-[28px] !text-[12px]" onClick={() => setOpen(true)}>
            <Plus size={13} strokeWidth={2.25} />
            Add link
          </Button>
        }
      >
        {servers.length === 0 ? (
          <Empty
            icon={<Shield size={18} strokeWidth={1.75} />}
            title="No private servers saved"
            hint="Paste a roblox.com/share?code=… link and TrapRAM stores the access code so every account can join later."
          />
        ) : (
          <div className="grid gap-1.5">
            {servers.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-[10px] bg-[var(--color-raised)] p-2">
                {s.iconUrl ? (
                  <img src={s.iconUrl} alt="" width={36} height={36} className="avatar h-9 w-9 rounded-[8px]" />
                ) : (
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-[var(--color-hover)] text-[var(--color-faint)]">
                    <Shield size={15} strokeWidth={1.75} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{s.name}</div>
                  <div className="num truncate text-[11.5px] text-[var(--color-faint)]">
                    {s.gameName ? `${s.gameName} · ` : ''}
                    {s.placeId}
                  </div>
                </div>
                <Button className="!h-[28px] !text-[12px]" onClick={() => void join(s)} disabled={!usable.length}>
                  <Play size={12} strokeWidth={2.25} />
                  Join
                </Button>
                <Button
                  variant="danger"
                  className="!h-[28px] !w-[28px] !px-0"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => void run('Deleting', () => api.call('server:remove', s.id), 'Removed')}
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Modal
        open={open}
        title="Add a private server"
        description="TrapRAM resolves the share link once and keeps the access code."
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={() => void add()}>
              Resolve and save
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <div>
            <Label hint="Optional — defaults to the experience name">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Friends only" />
          </div>
          <div>
            <Label>Share link</Label>
            <Input
              className="!text-[11.5px]"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://www.roblox.com/share?code=…&type=Server"
              spellCheck={false}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

function extractShareCode(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const code = new URL(trimmed).searchParams.get('code')
    if (code) return code
  } catch {}
  return /^[a-f0-9-]{8,}$/i.test(trimmed) ? trimmed : null
}
