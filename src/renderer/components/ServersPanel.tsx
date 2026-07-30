import { useState } from 'react'
import { Server, Play, RefreshCw, Search } from 'lucide-react'
import type { GameServer } from '@shared/types'
import { useStore } from '../store'
import { api } from '../lib/api'
import { Button, Input, Label, Empty, Section, Segmented } from './ui'

type Filter = 'all' | 'empty' | 'full'

export default function ServersPanel() {
  const { selected, accounts, run, toast } = useStore()
  const [placeId, setPlaceId] = useState('')
  const [list, setList] = useState<GameServer[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(false)

  const usable = accounts.filter((a) => selected.includes(a.userId) && !a.cookieExpired)
  const numericPlace = Number(placeId.replace(/\D/g, ''))

  async function load(next?: boolean) {
    if (!numericPlace) return toast('err', 'Enter a Place ID first')
    if (!accounts.length) return toast('err', 'Add an account first — the server list needs a session')
    const who = usable[0] ?? accounts[0]
    setLoading(true)
    const res = await run('Loading servers', () =>
      api.call<{ list: GameServer[]; cursor?: string }>('game:servers', who.userId, numericPlace, next ? cursor : undefined)
    )
    setLoading(false)
    if (!res) return
    setList(next ? [...list, ...res.list] : res.list)
    setCursor(res.cursor)
  }

  async function join(jobId: string) {
    if (!usable.length) return toast('err', 'Select at least one account')
    const target = { placeId: numericPlace, jobId }
    const failed = await run(`Joining ${usable.length} account${usable.length === 1 ? '' : 's'}`, () =>
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
            <Label>Place ID</Label>
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
                onKeyDown={(e) => e.key === 'Enter' && void load()}
              />
            </div>
          </div>
          <Button variant="primary" loading={loading} onClick={() => void load()}>
            <RefreshCw size={14} strokeWidth={2} />
            Load
          </Button>
        </div>

        {list.length > 0 && (
          <div className="mt-3 flex items-center justify-between">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'empty', label: 'Emptiest' },
                { value: 'full', label: 'Fullest' }
              ]}
            />
            <span className="num text-[11.5px] text-[var(--color-faint)]">{shown.length} servers</span>
          </div>
        )}
      </Section>

      {shown.length === 0 ? (
        <Empty
          icon={<Server size={18} strokeWidth={1.75} />}
          title="No servers loaded"
          hint="Enter a Place ID and load the list. TrapRAM uses the first selected account's session to read it."
        />
      ) : (
        <div className="grid gap-1">
          {shown.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-[10px] bg-[var(--color-raised)] px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="num truncate font-mono text-[11px] text-[var(--color-dim)]">{s.id}</div>
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
              <Button className="!h-[28px] !text-[12px]" onClick={() => void join(s.id)} disabled={!usable.length}>
                <Play size={12} strokeWidth={2.25} />
                Join
              </Button>
            </div>
          ))}
          {cursor && (
            <Button className="mt-2" onClick={() => void load(true)} loading={loading}>
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
