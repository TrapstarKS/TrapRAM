import { useEffect, useRef, useState } from 'react'
import { Search, Star, Play, Gamepad2, Users, Pencil } from 'lucide-react'
import type { Preset } from '@shared/types'
import { useStore, readyAccounts } from '../store'
import { api } from '../lib/api'
import { Button, Input, Label, Empty, Section, Segmented, Modal } from './ui'

interface GameHit {
  universeId: number
  placeId: number
  name: string
  creator: string
  playing: number
  icon?: string
  jobId?: string
}

interface GameInfo {
  name: string
  universeId: number
  icon?: string
}

export default function GamesPanel() {
  const store = useStore()
  const { presets, run, toast, launch: runLaunch, launching } = store
  const [view, setView] = useState<'search' | 'favorites'>('favorites')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<GameHit[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [editing, setEditing] = useState<Preset | null>(null)
  const [placeId, setPlaceId] = useState('')
  const [adding, setAdding] = useState(false)
  const [searchError, setSearchError] = useState('')
  const request = useRef(0)
  const [saving, setSaving] = useState(false)

  const usable = readyAccounts(store)
  const favouriteIds = new Set(presets.map((p) => p.placeId))

  useEffect(() => {
    if (!presets.length) setView('search')
  }, [])

  async function search() {
    const q = query.trim()
    if (q.length < 2) return
    const current = ++request.current
    setLoading(true)
    setHits([])
    setSearchError('')
    try {
      const res = await api.call<GameHit[]>('game:search', q)
      if (current === request.current) { setHits(res); setSearched(true) }
    } catch {
      if (current === request.current) setSearchError('Could not search Roblox. Check your connection and try again.')
    } finally { if (current === request.current) setLoading(false) }
  }

  async function favourite(g: GameHit) {
    const existing = presets.find((p) => p.placeId === g.placeId)
    if (existing) {
      await run('Removing favourite', () => api.call('preset:remove', existing.id))
      return
    }
    const preset: Preset = {
      id: '',
      name: g.name,
      placeId: g.placeId,
      universeId: g.universeId,
      iconUrl: g.icon,
      gameName: g.name
    }
    await run('Saving favourite', () => api.call('preset:save', preset), `${g.name} favourited`)
  }

  async function addByPlaceId() {
    const raw = placeId.trim()
    if (!/^\d+$/.test(raw)) return toast('err', 'Enter a valid Place ID')
    const id = Number(raw)
    if (!Number.isSafeInteger(id) || id <= 0) return toast('err', 'Enter a valid Place ID')
    if (presets.some((p) => p.placeId === id)) return toast('info', 'That game is already favourited')

    setAdding(true)
    const info = await run('Resolving game', () => api.call<GameInfo>('game:ping', id))
    if (!info) {
      setAdding(false)
      return
    }
    const preset: Preset = {
      id: '',
      name: info.name || `Place ${id}`,
      placeId: id,
      universeId: info.universeId,
      iconUrl: info.icon,
      gameName: info.name || `Place ${id}`
    }
    const saved = await run(
      'Saving favourite',
      async () => {
        await api.call('preset:save', preset)
        return true
      },
      `${preset.name} favourited`
    )
    setAdding(false)
    if (saved) setPlaceId('')
  }

  async function launch(placeId: number, name: string, jobId?: string) {
    if (!usable.length) return toast('err', 'Select at least one account first')
    const failed = await runLaunch(`Launching ${usable.length} account${usable.length === 1 ? '' : 's'}`, () =>
      api.call<{ error: string }[]>(
        'launch:many',
        usable.map((a) => a.userId),
        { placeId, jobId }
      )
    )
    if (failed) toast(failed.length ? 'err' : 'ok', failed.length ? failed[0].error : `Launching ${name}`)
  }

  const cards: GameHit[] =
    view === 'favorites'
      ? presets.map((p) => ({
          universeId: p.universeId ?? 0,
          placeId: p.placeId,
          name: p.name,
          creator: '',
          playing: -1,
          icon: p.iconUrl,
          jobId: p.jobId
        }))
      : hits

  return (
    <div className="p-5">
      <Section
        title="Experience library"
        hint={view === 'favorites' ? 'Your saved experiences' : 'Search every experience on Roblox'}
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'favorites', label: `Favourites${presets.length ? ` (${presets.length})` : ''}` },
              { value: 'search', label: 'Search' }
            ]}
          />
        }
      >
        {view === 'search' && (
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  size={14}
                  strokeWidth={1.75}
                  className="pointer-events-none absolute inset-y-0 my-auto ms-2.5 text-[var(--color-faint)]"
                />
                <Input
                  aria-label="Search Roblox games"
                  className="!ps-8"
                  placeholder="Brookhaven, Doors, Blox Fruits…"
                  value={query}
                  onChange={(e) => { request.current++; setQuery(e.target.value); setHits([]); setSearched(false); setLoading(false); setSearchError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && void search()}
                  autoFocus
                />
              </div>
              <Button variant="primary" loading={loading} onClick={() => void search()} disabled={query.trim().length < 2}>
                Search
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="num flex-1"
                inputMode="numeric"
                aria-label="Place ID"
                placeholder="Or add a favourite by Place ID"
                value={placeId}
                onChange={(e) => setPlaceId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addByPlaceId()}
              />
              <Button loading={adding} onClick={() => void addByPlaceId()} disabled={!placeId.trim()}>
                Add by ID
              </Button>
            </div>
          </div>
        )}
      </Section>

      <div className="selection-notice"><Users size={15} /><span>{usable.length ? `${usable.length} account(s) ready to launch` : 'Select an account with a saved session to launch a game. You can browse and save favourites first.'}</span></div>
      {view === 'search' && loading ? <div role="status" className="py-12 text-center text-[var(--color-dim)]">Searching Roblox…</div> : view === 'search' && searchError ? <Empty icon={<Search size={18} />} title="Search unavailable" hint={searchError} action={<Button onClick={() => void search()}>Try again</Button>} /> : cards.length === 0 ? (
        <Empty
          icon={<Gamepad2 size={18} strokeWidth={1.75} />}
          title={view === 'favorites' ? 'No favourites yet' : searched ? 'Nothing found' : 'Search for a game'}
          hint={
            view === 'favorites'
              ? 'Star a game from the search tab and it lands here, ready to launch on every selected account.'
              : searched
                ? 'Try a shorter or differently spelled name.'
                : 'Results come straight from the public Roblox catalogue — no account needed.'
          }
          action={view === 'favorites' ? <Button onClick={() => setView('search')}>Find a game</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-3">
          {cards.map((g) => (
            <div key={`${g.placeId}-${g.universeId}`} className="game-card group flex flex-col">
              <div className="relative overflow-hidden rounded-[12px] bg-[var(--color-raised)]">
                {g.icon ? (
                  <img
                    src={g.icon}
                    alt=""
                    className="avatar aspect-square w-full rounded-[12px] object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="avatar grid aspect-square w-full place-items-center rounded-[12px] text-[var(--color-faint)]">
                    <Gamepad2 size={22} strokeWidth={1.5} />
                  </div>
                )}

              </div>
              <div className="game-actions">
                  <Button
                    variant="soft"
                    className="!h-[28px] flex-1 !text-[12px]"
                    onClick={() => void launch(g.placeId, g.name, g.jobId)}
                    disabled={!usable.length || launching}
                  >
                    <Play size={12} strokeWidth={2.5} />
                    Launch
                  </Button>
                  {view === 'favorites' && (
                    <button
                      aria-label={`Edit ${g.name}`}
                      title="Rename or pin a Job ID"
                      onClick={() => setEditing(presets.find((p) => p.placeId === g.placeId) ?? null)}
                      className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-[8px] bg-[var(--color-raised)] text-[var(--color-dim)] transition-[background-color,scale] duration-150 ease-[var(--ease-out)] hover:bg-[var(--color-hover)] active:scale-[0.96]"
                    >
                      <Pencil size={12} strokeWidth={2} />
                    </button>
                  )}
                  <button
                    aria-label={favouriteIds.has(g.placeId) ? `Unfavourite ${g.name}` : `Favourite ${g.name}`}
                    title={favouriteIds.has(g.placeId) ? 'Remove from favourites' : 'Add to favourites'}
                    onClick={() => void favourite(g)}
                    className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-[8px] bg-[var(--color-raised)] text-[var(--color-dim)] transition-[background-color,scale] duration-150 ease-[var(--ease-out)] hover:bg-[var(--color-hover)] active:scale-[0.96]"
                  >
                    <Star
                      size={13}
                      strokeWidth={2}
                      fill={favouriteIds.has(g.placeId) ? 'currentColor' : 'none'}
                      style={{ color: favouriteIds.has(g.placeId) ? 'var(--color-warn)' : 'currentColor' }}
                    />
                  </button>
                </div>
              <div className="mt-1.5 min-w-0">
                <div className="truncate text-[12.5px] font-semibold" title={g.name}>
                  {g.name}
                </div>
                <div className="num flex items-center gap-1 truncate text-[11px] text-[var(--color-faint)]">
                  {g.playing >= 0 ? (
                    <>
                      <Users size={10} strokeWidth={2} />
                      {g.playing.toLocaleString()}
                      {g.creator ? ` · ${g.creator}` : ''}
                    </>
                  ) : (
                    g.placeId
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        title="Edit favourite"
        description="Pin a Job ID to always land in the same server."
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={saving}
              onClick={async () => {
                if (!editing?.name.trim()) return toast('err', 'Enter a name for this favourite.')
                setSaving(true)
                const saved = await run('Saving', async () => { await api.call('preset:save', editing); return true }, 'Favourite saved')
                setSaving(false)
                if (saved) setEditing(null)
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-3">
            <div>
              <Label htmlFor="gamespanel-name">Name</Label>
              <Input id="gamespanel-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="gamespanel-job-id" hint="Optional — always join this exact server">Job ID</Label>
              <Input id="gamespanel-job-id"
                className="num !text-[11.5px]"
                value={editing.jobId ?? ''}
                onChange={(e) => setEditing({ ...editing, jobId: e.target.value || undefined })}
                spellCheck={false}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
