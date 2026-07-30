import { useEffect, useState } from 'react'
import { Play, Search, Bookmark, Users2, Rocket, Link2, MousePointerClick, Layers } from 'lucide-react'
import type { Preset } from '@shared/types'
import { useStore, visibleAccounts } from '../store'
import { api, relative } from '../lib/api'
import { Button, Input, Label, Empty, Section } from './ui'

interface GameMeta {
  name: string
  playing: number
  icon?: string
  universeId: number
}

export default function LaunchPanel() {
  const store = useStore()
  const { selected, accounts, presets, settings, run, toast, setTab, patchSettings } = store
  const [placeId, setPlaceId] = useState('')
  const [jobId, setJobId] = useState('')
  const [meta, setMeta] = useState<GameMeta | null>(null)
  const [resolving, setResolving] = useState(false)

  const chosen = accounts.filter((a) => selected.includes(a.userId))
  const usable = chosen.filter((a) => !a.cookieExpired)
  const numericPlace = Number(placeId.replace(/\D/g, ''))

  useEffect(() => {
    setMeta(null)
    if (!numericPlace || String(numericPlace).length < 5) return
    let cancelled = false
    setResolving(true)
    const t = setTimeout(async () => {
      try {
        const m = await api.call<GameMeta>('game:ping', numericPlace)
        if (!cancelled) setMeta(m)
      } catch {
        if (!cancelled) setMeta(null)
      } finally {
        if (!cancelled) setResolving(false)
      }
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [numericPlace])

  async function launch() {
    if (!numericPlace) return toast('err', 'Enter a Place ID first')
    if (!usable.length) return toast('err', 'Select at least one account with a valid session')

    const target = { placeId: numericPlace, jobId: jobId.trim() || undefined }
    if (usable.length === 1) {
      await run('Launching', () => api.call('launch:one', usable[0].userId, target), `Launching ${usable[0].username}`)
      return
    }
    const failed = await run(`Launching ${usable.length} accounts`, () =>
      api.call<{ userId: number; error: string }[]>(
        'launch:many',
        usable.map((a) => a.userId),
        target
      )
    )
    if (failed) {
      if (failed.length === 0) toast('ok', `Launched ${usable.length} accounts`)
      else toast('err', `${failed.length} of ${usable.length} failed — ${failed[0].error}`)
    }
  }

  function usePreset(p: Preset) {
    setPlaceId(String(p.placeId))
    setJobId(p.jobId ?? '')
  }

  async function follow(targetUserId: number) {
    if (!usable.length) return toast('err', 'Select the accounts that should join')
    for (const a of usable) {
      if (a.userId === targetUserId) continue
      await run(`Following into server`, () => api.call('launch:follow', a.userId, targetUserId))
    }
    toast('ok', 'Join requested')
  }

  const inGame = visibleAccounts(store).filter((a) => a.presence.type === 2 && a.presence.gameId)

  return (
    <div className="p-5">
      <Section
        title="Launch"
        hint={
          chosen.length
            ? `${usable.length} of ${chosen.length} selected account${chosen.length === 1 ? '' : 's'} ready`
            : 'Select accounts in the list on the left'
        }
      >
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div>
              <Label hint="The number in a Roblox experience URL">Place ID</Label>
              <div className="relative">
                <Search
                  size={14}
                  strokeWidth={1.75}
                  className="pointer-events-none absolute inset-y-0 my-auto ms-2.5 text-[var(--color-faint)]"
                />
                <Input
                  className="!ps-8 num"
                  inputMode="numeric"
                  placeholder="e.g. 920587237"
                  value={placeId}
                  onChange={(e) => setPlaceId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void launch()}
                />
              </div>
            </div>
            <div className="w-[230px]">
              <Label hint="Optional — joins one exact server">Job ID</Label>
              <Input
                className="num !text-[11.5px]"
                placeholder="Leave empty for any server"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                spellCheck={false}
              />
            </div>
          </div>

          {(meta || resolving) && (
            <div className="flex items-center gap-3 rounded-[10px] bg-[var(--color-raised)] p-2.5">
              {meta?.icon ? (
                <img src={meta.icon} alt="" width={38} height={38} className="avatar h-[38px] w-[38px] rounded-[8px]" />
              ) : (
                <div className="avatar h-[38px] w-[38px] animate-pulse rounded-[8px] bg-[var(--color-hover)]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">{meta?.name ?? 'Resolving…'}</div>
                {meta && (
                  <div className="num text-[11.5px] text-[var(--color-faint)]">
                    {meta.playing.toLocaleString()} playing now
                  </div>
                )}
              </div>
              <Button
                className="!h-[28px] !text-[12px]"
                onClick={() => setTab('servers')}
                disabled={!meta}
                title="Pick a specific server"
              >
                <Link2 size={13} strokeWidth={1.75} />
                Browse servers
              </Button>
            </div>
          )}

          {settings && !settings.multiInstance && (
            <div
              className="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5"
              style={{ background: 'oklch(0.79 0.152 78 / 0.12)', boxShadow: 'inset 0 0 0 1px oklch(0.79 0.152 78 / 0.28)' }}
            >
              <Layers size={15} strokeWidth={1.75} style={{ color: 'var(--color-warn)' }} className="shrink-0" />
              <span className="min-w-0 flex-1 text-[12px] leading-snug">
                Only one Roblox client can run at a time, so launching replaces whatever is already open.
              </span>
              <Button
                className="!h-[27px] shrink-0 !text-[12px]"
                onClick={() => void patchSettings({ multiInstance: true })}
              >
                Allow multiple
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button variant="primary" className="!h-[36px] flex-1" onClick={() => void launch()} disabled={!usable.length}>
              <Play size={15} strokeWidth={2.25} />
              {usable.length > 1 ? `Launch ${usable.length} accounts` : 'Launch'}
            </Button>
            {settings && settings.launchDelayMs > 0 && usable.length > 1 && (
              <span className="num shrink-0 text-[11.5px] text-[var(--color-faint)]">
                {(settings.launchDelayMs / 1000).toFixed(1)}s apart
              </span>
            )}
          </div>
        </div>
      </Section>

      {presets.length > 0 && (
        <Section
          title="Quick launch"
          hint="Your favourite games"
          actions={
            <Button className="!h-[26px] !text-[12px]" onClick={() => setTab('games')}>
              Manage
            </Button>
          }
        >
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => usePreset(p)}
                className="flex items-center gap-2.5 rounded-[10px] bg-[var(--color-raised)] p-2 text-start transition-[background-color,scale] duration-150 ease-[var(--ease-out)] hover:bg-[var(--color-hover)] active:scale-[0.98]"
              >
                {p.iconUrl ? (
                  <img src={p.iconUrl} alt="" width={30} height={30} className="avatar h-[30px] w-[30px] rounded-[7px]" />
                ) : (
                  <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[7px] bg-[var(--color-hover)] text-[var(--color-faint)]">
                    <Bookmark size={14} strokeWidth={1.75} />
                  </div>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold">{p.name}</span>
                  <span className="num block truncate text-[11px] text-[var(--color-faint)]">
                    {p.jobId ? 'Fixed server' : p.gameName || p.placeId}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Join an account" hint="Send the selected accounts into a server one of your accounts is already in">
        {inGame.length === 0 ? (
          <Empty
            icon={<Users2 size={18} strokeWidth={1.75} />}
            title="Nobody is in a game"
            hint="When one of your accounts joins an experience it shows up here, and the rest can pile in with one click."
          />
        ) : (
          <div className="grid gap-1.5">
            {inGame.map((a) => (
              <div key={a.userId} className="flex items-center gap-3 rounded-[10px] bg-[var(--color-raised)] p-2">
                {a.avatarUrl ? (
                  <img src={a.avatarUrl} alt="" width={28} height={28} className="avatar h-7 w-7 rounded-full" />
                ) : (
                  <div className="avatar h-7 w-7 rounded-full bg-[var(--color-hover)]" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold">{a.alias || a.username}</div>
                  <div className="truncate text-[11px] text-[var(--color-faint)]">{a.presence.lastLocation}</div>
                </div>
                <Button className="!h-[28px] !text-[12px]" onClick={() => void follow(a.userId)} disabled={!usable.length}>
                  <Rocket size={13} strokeWidth={1.75} />
                  Join
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {chosen.length > 0 && (
        <Section title="Selected" hint={`Last launch times`}>
          <div className="grid gap-1">
            {chosen.map((a) => (
              <div key={a.userId} className="flex items-center gap-2 px-1 py-1 text-[12px]">
                <MousePointerClick size={12} strokeWidth={1.75} className="text-[var(--color-faint)]" />
                <span className="truncate font-medium">{a.alias || a.username}</span>
                <span className="ms-auto shrink-0 text-[11.5px] text-[var(--color-faint)]">
                  {a.cookieExpired ? 'session expired' : relative(a.lastLaunch)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
