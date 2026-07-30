import { useEffect, useState } from 'react'
import { Search, Star, Play, Gamepad2, Users, Pencil } from 'lucide-react'
import type { Preset } from '@shared/types'
import { useStore } from '../store'
import { api } from '../lib/api'
import { Button, Input, Label, Empty, Section, Segmented, Modal } from './ui'

interface GameHit {
  universeId: number
  placeId: number
  name: string
  creator: string
  playing: number
  icon?: string
}

export default function GamesPanel() {
  const { presets, selected, accounts, run, toast } = useStore()
  const [view, setView] = useState<'search' | 'favorites'>('favorites')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<GameHit[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [editing, setEditing] = useState<Preset | null>(null)

  const usable = accounts.filter((a) => selected.includes(a.userId) && !a.cookieExpired)
  const favouriteIds = new Set(presets.map((p) => p.placeId))

  useEffect(() => {
    if (!presets.length) setView('search')
  }, [])

  async function search() {
    const q = query.trim()
    if (q.length < 2) return
    setLoading(true)
    const res = await run('Searching Roblox', () => api.call<GameHit[]>('game:search', q))
    setLoading(false)
    setSearched(true)
    if (res) setHits(res)
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

  async function launch(placeId: number, name: string, jobId?: string) {
    if (!usable.length) return toast('err', 'Select at least one account first')
    const failed = await run(`Launching ${usable.length} account${usable.length === 1 ? '' : 's'}`, () =>
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
          icon: p.iconUrl
        }))
      : hits

  return (
    <div className="p-5">
      <Section
        title="Games"
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
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={14}
                strokeWidth={1.75}
                className="pointer-events-none absolute inset-y-0 my-auto ms-2.5 text-[var(--color-faint)]"
              />
              <Input
                className="!ps-8"
                placeholder="Brookhaven, Doors, Blox Fruits…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void search()}
                autoFocus
              />
            </div>
            <Button variant="primary" loading={loading} onClick={() => void search()} disabled={query.trim().length < 2}>
              Search
            </Button>
          </div>
        )}
      </Section>

      {cards.length === 0 ? (
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
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-3">
          {cards.map((g) => (
            <div key={`${g.placeId}-${g.universeId}`} className="group flex flex-col">
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

                <div className="absolute inset-x-0 bottom-0 flex gap-1.5 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity duration-150 ease-[var(--ease-out)] group-hover:opacity-100 group-focus-within:opacity-100">
                  <Button
                    variant="primary"
                    className="!h-[28px] flex-1 !text-[12px]"
                    onClick={() => void launch(g.placeId, g.name)}
                    disabled={!usable.length}
                  >
                    <Play size={12} strokeWidth={2.5} />
                    Launch
                  </Button>
                  {view === 'favorites' && (
                    <button
                      aria-label={`Edit ${g.name}`}
                      title="Rename or pin a Job ID"
                      onClick={() => setEditing(presets.find((p) => p.placeId === g.placeId) ?? null)}
                      className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-[8px] bg-black/55 text-white transition-[background-color,scale] duration-150 ease-[var(--ease-out)] hover:bg-black/75 active:scale-[0.96]"
                    >
                      <Pencil size={12} strokeWidth={2} />
                    </button>
                  )}
                  <button
                    aria-label={favouriteIds.has(g.placeId) ? `Unfavourite ${g.name}` : `Favourite ${g.name}`}
                    title={favouriteIds.has(g.placeId) ? 'Remove from favourites' : 'Add to favourites'}
                    onClick={() => void favourite(g)}
                    className="grid h-[28px] w-[28px] shrink-0 place-items-center rounded-[8px] bg-black/55 text-white transition-[background-color,scale] duration-150 ease-[var(--ease-out)] hover:bg-black/75 active:scale-[0.96]"
                  >
                    <Star
                      size={13}
                      strokeWidth={2}
                      fill={favouriteIds.has(g.placeId) ? 'currentColor' : 'none'}
                      style={{ color: favouriteIds.has(g.placeId) ? 'var(--color-warn)' : 'currentColor' }}
                    />
                  </button>
                </div>
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
              onClick={() =>
                void run('Saving', () => api.call('preset:save', editing), 'Saved').then(() => setEditing(null))
              }
            >
              Save
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-3">
            <div>
              <Label>Name</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <Label hint="Optional — always join this exact server">Job ID</Label>
              <Input
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
