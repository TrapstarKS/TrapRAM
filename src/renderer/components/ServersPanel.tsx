import { useEffect, useRef, useState } from 'react'
import { Server, Play, RefreshCw, Search } from 'lucide-react'
import type { GameServer } from '@shared/types'
import { useStore, readyAccounts } from '../store'
import { parsePlaceId } from '@shared/plain'
import { api } from '../lib/api'
import { Button, Input, Label, Empty, Section, Segmented } from './ui'

type Filter = 'all' | 'empty' | 'full'

export default function ServersPanel() {
  const store = useStore()
  const { accounts, settings, withCookie, toast, launch: runLaunch, launching } = store
  const [placeId, setPlaceId] = useState(() => {
    const last = useStore.getState().settings?.lastPlaceId
    return last ? String(last) : ''
  })
  const [list, setList] = useState<GameServer[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)

  useEffect(() => {
    if (settings?.lastPlaceId && !placeId) setPlaceId(String(settings.lastPlaceId))
  }, [settings?.lastPlaceId])

  const usable = readyAccounts(store)
  const numericPlace = parsePlaceId(placeId)

  function changePlace(value: string) {
    request.current++
    setPlaceId(value)
    setList([])
    setCursor(undefined)
    setLoaded(false)
    setLoading(false)
    setError('')
  }

  async function load(next = false) {
    if (!numericPlace) return setError('Enter a valid Place ID or a full Roblox game link.')
    const who = usable[0] ?? accounts.find(a => !a.cookieExpired && withCookie.includes(a.userId))
    if (!who) return setError('Add an account with a saved session to load servers.')
    const current = ++request.current
    setLoading(true)
    setError('')
    if (!next) { setList([]); setCursor(undefined); setLoaded(false) }
    try {
      const res = await api.call<{ list: GameServer[]; cursor?: string }>('game:servers', who.userId, numericPlace, next ? cursor : undefined)
      if (current !== request.current) return
      setList(previous => next ? [...new Map([...previous, ...res.list].map(s => [s.id, s])).values()] : res.list)
      setCursor(res.cursor)
      setLoaded(true)
    } catch (error) {
      if (current === request.current) setError(`Could not load servers. ${error instanceof Error ? error.message : 'Check your connection.'} Try again.`)
    } finally { if (current === request.current) setLoading(false) }
  }

  async function join(jobId: string) {
    if (!usable.length) return toast('err', 'Select at least one account')
    const target = { placeId: numericPlace, jobId }
    const failed = await runLaunch(`Joining ${usable.length} account${usable.length === 1 ? '' : 's'}`, () =>
      api.call<{ error: string }[]>(
        'launch:many',
        usable.map((a) => a.userId),
        target
      )
    )
    if (failed) toast(failed.length ? 'err' : 'ok', failed.length ? failed[0].error : 'Joining that server')
  }

  const shown = list
    .filter((s) => (filter === 'empty' ? s.playing < s.maxPlayers : filter === 'full' ? s.playing >= s.maxPlayers - 1 : true))
    .sort((a, b) => (filter === 'empty' ? a.playing - b.playing : b.playing - a.playing))

  return (
    <div className="p-5">
      <Section title="Server browser" hint="Pick an exact server and send every selected account into it">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="serverspanel-place-id">Experience link or Place ID</Label>
            <div className="relative">
              <Search
                size={14}
                strokeWidth={1.75}
                className="pointer-events-none absolute inset-y-0 my-auto ms-2.5 text-[var(--color-faint)]"
              />
              <Input id="serverspanel-place-id"
                className="!ps-8 num"
                placeholder="e.g. 920587237"
                value={placeId}
                onChange={(e) => changePlace(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void load()}
              />
            </div>
          </div>
          <Button variant="primary" loading={loading} onClick={() => void load()}>
            <RefreshCw size={14} strokeWidth={2} />
            Load servers
          </Button>
        </div>

        {list.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'empty', label: 'Most space' },
                { value: 'full', label: 'Nearly full' }
              ]}
            />
            <span className="num text-[11.5px] text-[var(--color-faint)]">{shown.length} servers</span>
          </div>
        )}
      </Section>

      <div className="selection-notice">{usable.length ? `${usable.length} account(s) ready to join` : 'Select accounts to join. Browsing uses an available saved session.'}</div>
      {error && <div role="alert" className="mb-4 rounded-lg border border-[var(--color-bad)] p-3 text-[13px] text-[var(--color-bad)]">{error} <Button onClick={() => void load()}>Try again</Button></div>}
      {loading && !list.length ? <div role="status" className="py-12 text-center text-[var(--color-dim)]">Loading servers…</div> : shown.length === 0 ? (
        <Empty
          icon={<Server size={18} strokeWidth={1.75} />}
          title={loaded ? list.length ? 'No servers match this filter' : 'No public servers found' : 'Find a server'}
          hint={loaded ? 'Try another filter or refresh the server list.' : 'Paste an experience link or Place ID above, then load its public servers.'}
          action={filter !== 'all' ? <Button onClick={() => setFilter('all')}>Clear filter</Button> : undefined}
        />
      ) : (
        <div className="grid gap-1">
          {shown.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-[10px] bg-[var(--color-raised)] px-3 py-2">
              <div className="min-w-0 flex-1">
                <div title={s.id} className="num truncate font-mono text-[11px] text-[var(--color-dim)]">{s.id}</div>
                <div className="mt-1 h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-[var(--color-bg-deep)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (s.playing / s.maxPlayers) * 100)}%`,
                      background:
                        s.playing >= s.maxPlayers ? 'var(--color-bad)' : s.playing > s.maxPlayers * 0.8 ? 'var(--color-warn)' : 'var(--color-ok)'
                    }}
                  />
                </div>
              </div>
              <div className="num shrink-0 text-end text-[11.5px] text-[var(--color-dim)]">
                <div className="font-semibold text-[var(--color-text)]">
                  {s.playing}/{s.maxPlayers}
                </div>
                <div className="text-[var(--color-faint)]">
                  {Math.round(s.fps)} fps{s.ping ? ` · ${s.ping} ms` : ''}
                </div>
              </div>
              <Button className="!h-[28px] !text-[12px]" onClick={() => void join(s.id)} disabled={!usable.length || launching || s.playing >= s.maxPlayers}>
                <Play size={12} strokeWidth={2.25} />
                {s.playing >= s.maxPlayers ? 'Full' : 'Join'}
              </Button>
            </div>
          ))}

        </div>
      )}
      {cursor && <Button className="mt-3 w-full" onClick={() => void load(true)} loading={loading}>Load more servers</Button>}
    </div>
  )
}
