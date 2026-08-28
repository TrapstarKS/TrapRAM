import { useEffect, useRef, useState } from 'react'
import {
  Play,
  Search,
  Bookmark,
  Users2,
  Rocket,
  Link2,
  MousePointerClick,
  Layers,
  Star,
  RefreshCw,
  Clock3,
  UserRoundSearch,
  UserPlus,
  HeartHandshake
} from 'lucide-react'
import type { PlayerProfile, PlayerRelationship, Preset, RecentGame } from '@shared/types'
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
  const { selected, accounts, presets, settings, withCookie, run, toast, setTab, patchSettings } = store
  const [placeId, setPlaceId] = useState('')
  const [jobId, setJobId] = useState('')
  const seeded = useRef(false)
  const [meta, setMeta] = useState<GameMeta | null>(null)
  const [resolving, setResolving] = useState(false)
  const [recentAccountId, setRecentAccountId] = useState<number | null>(null)
  const [recentGames, setRecentGames] = useState<RecentGame[]>([])
  const [recentLoading, setRecentLoading] = useState(false)
  const [recentError, setRecentError] = useState<string | null>(null)
  const [recentReload, setRecentReload] = useState(0)
  const [playerQuery, setPlayerQuery] = useState('')
  const [player, setPlayer] = useState<PlayerProfile | null>(null)
  const [playerLoading, setPlayerLoading] = useState(false)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [playerAction, setPlayerAction] = useState<'friend' | 'follow' | 'join' | null>(null)
  const [playerRelationships, setPlayerRelationships] = useState<PlayerRelationship[]>([])
  const [relationshipLoading, setRelationshipLoading] = useState(false)
  const [relationshipError, setRelationshipError] = useState<string | null>(null)
  const [relationshipReload, setRelationshipReload] = useState(0)

  useEffect(() => {
    if (seeded.current || !settings) return
    seeded.current = true
    if (settings.lastPlaceId) setPlaceId(String(settings.lastPlaceId))
  }, [settings])

  const chosen = accounts.filter((a) => selected.includes(a.userId))
  const usable = chosen.filter((a) => !a.cookieExpired)
  const numericPlace = Number(placeId.replace(/\D/g, ''))
  const recentAccount = accounts.find((a) => a.userId === recentAccountId)
  const recentUserId = recentAccount?.userId ?? 0
  const recentExpired = recentAccount?.cookieExpired ?? false
  const recentHasCookie = recentAccount ? withCookie.includes(recentAccount.userId) : false
  const socialAccounts = usable.filter((a) => withCookie.includes(a.userId))
  const socialAccountIds = socialAccounts.map((a) => a.userId).join(',')
  const relationshipByUser = new Map(playerRelationships.map((relationship) => [relationship.userId, relationship]))
  const relationshipsReady =
    !!player &&
    !relationshipLoading &&
    playerRelationships.length === socialAccounts.length &&
    playerRelationships.every((relationship) => !relationship.error)
  const friendTargets = socialAccounts.filter((a) => relationshipByUser.get(a.userId)?.friendStatus === 'none')
  const followTargets = socialAccounts.filter((a) => !relationshipByUser.get(a.userId)?.isFollowing)
  const friendCount = socialAccounts.filter((a) => relationshipByUser.get(a.userId)?.friendStatus === 'friend').length
  const pendingFriendCount = socialAccounts.filter((a) => relationshipByUser.get(a.userId)?.friendStatus === 'pending').length
  const incomingFriendCount = socialAccounts.filter((a) => relationshipByUser.get(a.userId)?.friendStatus === 'incoming').length
  const followingCount = socialAccounts.length - followTargets.length
  const relationshipFailure = relationshipError ?? playerRelationships.find((relationship) => relationship.error)?.error ?? null
  const allFriends = relationshipsReady && socialAccounts.length > 0 && friendCount === socialAccounts.length
  const allPending = relationshipsReady && socialAccounts.length > 0 && pendingFriendCount === socialAccounts.length
  const allIncoming = relationshipsReady && socialAccounts.length > 0 && incomingFriendCount === socialAccounts.length
  const friendButtonLabel = allFriends
    ? 'Already friends'
    : allPending
      ? 'Pending'
      : allIncoming
        ? 'Incoming request'
        : !friendTargets.length && pendingFriendCount
          ? 'Pending'
          : !friendTargets.length && incomingFriendCount
            ? 'Incoming request'
            : 'Friend request'

  useEffect(() => {
    const currentExists = recentAccountId !== null && accounts.some((a) => a.userId === recentAccountId)
    const followsSingleSelection = selected.length === 1 && selected[0] !== recentAccountId
    const followsMultiSelection = selected.length > 1 && !selected.includes(recentAccountId ?? -1)
    if ((!currentExists || followsSingleSelection || followsMultiSelection) && accounts.length) {
      setRecentAccountId(selected[0] ?? accounts[0].userId)
    }
  }, [accounts, recentAccountId, selected])

  useEffect(() => {
    let cancelled = false
    setRecentGames([])
    setRecentError(null)

    if (!recentUserId) {
      setRecentLoading(false)
      return () => {
        cancelled = true
      }
    }
    if (recentExpired) {
      setRecentLoading(false)
      setRecentError('This account session has expired — sign in again to load its recent games.')
      return () => {
        cancelled = true
      }
    }
    if (!recentHasCookie) {
      setRecentLoading(false)
      setRecentError('This account has no saved session.')
      return () => {
        cancelled = true
      }
    }

    setRecentLoading(true)
    void api
      .call<RecentGame[]>('game:recent', recentUserId)
      .then((games) => {
        if (!cancelled) setRecentGames(games.slice(0, 8))
      })
      .catch((error: unknown) => {
        if (!cancelled) setRecentError(error instanceof Error ? error.message : 'Could not load recent games')
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [recentExpired, recentHasCookie, recentReload, recentUserId])

  useEffect(() => {
    let cancelled = false
    setPlayerRelationships([])
    setRelationshipError(null)

    if (!player || !socialAccountIds) {
      setRelationshipLoading(false)
      return () => {
        cancelled = true
      }
    }

    setRelationshipLoading(true)
    void api
      .call<PlayerRelationship[]>('player:status', socialAccounts.map((a) => a.userId), player.userId)
      .then((relationships) => {
        if (!cancelled) setPlayerRelationships(relationships)
      })
      .catch((error: unknown) => {
        if (!cancelled) setRelationshipError(error instanceof Error ? error.message : 'Could not check player status')
      })
      .finally(() => {
        if (!cancelled) setRelationshipLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [player?.userId, relationshipReload, socialAccountIds])

  useEffect(() => {
    if (!player || !socialAccountIds) return
    const interval = window.setInterval(() => setRelationshipReload((value) => value + 1), 15_000)
    return () => window.clearInterval(interval)
  }, [player?.userId, socialAccountIds])

  useEffect(() => {
    setMeta(null)
    if (!numericPlace || String(numericPlace).length < 5) return
    let cancelled = false
    setResolving(true)
    const t = setTimeout(async () => {
      try {
        const m = await api.call<GameMeta>('game:ping', numericPlace)
        if (cancelled) return
        setMeta(m)
        if (useStore.getState().settings?.lastPlaceId !== numericPlace) {
          void patchSettings({ lastPlaceId: numericPlace })
        }
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

  function useRecent(game: RecentGame) {
    setPlaceId(String(game.placeId))
    setJobId('')
  }

  async function toggleRecentFavourite(game: RecentGame) {
    const existing = presets.find((p) => p.placeId === game.placeId)
    if (existing) {
      await run('Removing favourite', () => api.call('preset:remove', existing.id))
      return
    }
    await run(
      'Saving favourite',
      () =>
        api.call('preset:save', {
          id: '',
          name: game.name,
          placeId: game.placeId,
          universeId: game.universeId,
          iconUrl: game.iconUrl,
          gameName: game.name
        } satisfies Preset),
      `${game.name} favourited`
    )
  }

  async function launchRecent(game: RecentGame) {
    const targets = usable.length
      ? usable
      : recentAccount && !recentExpired && recentHasCookie
        ? [recentAccount]
        : []
    if (!targets.length) return toast('err', 'Select an account with a valid session first')

    const failed = await run('Launching recent game', () =>
      api.call<{ userId: number; error: string }[]>('launch:many', targets.map((a) => a.userId), {
        placeId: game.placeId
      })
    )
    if (failed) toast(failed.length ? 'err' : 'ok', failed.length ? failed[0].error : `Launching ${game.name}`)
  }

  async function lookupPlayer() {
    const query = playerQuery.trim()
    if (!query) return toast('err', 'Enter a username or User ID')

    setPlayerLoading(true)
    setPlayer(null)
    setPlayerError(null)
    try {
      const result = await api.call<PlayerProfile | null>('player:lookup', query)
      if (result) setPlayer(result)
      else setPlayerError('Player not found')
    } catch (error: unknown) {
      setPlayerError(error instanceof Error ? error.message : 'Could not find that player')
    } finally {
      setPlayerLoading(false)
    }
  }

  async function actOnPlayer(action: 'friend' | 'follow' | 'join') {
    if (!player) return toast('err', 'Find a player first')
    if (!socialAccounts.length) return toast('err', 'Select at least one account with a valid session')
    if (action !== 'join' && !relationshipsReady) return toast('info', 'Still checking this player relationship')

    const targetAccounts = action === 'friend' ? friendTargets : action === 'follow' ? followTargets : socialAccounts
    if (!targetAccounts.length) {
      return toast('info', action === 'friend' ? 'All selected accounts are already friends' : 'All selected accounts already follow this player')
    }

    setPlayerAction(action)
    const failed = await run(`Player ${action}`, () => {
      const ids = targetAccounts.map((a) => a.userId)
      if (action === 'friend') {
        return api.call<{ userId: number; error: string }[]>('player:friend', ids, player.userId)
      }
      if (action === 'follow') {
        return api.call<{ userId: number; error: string }[]>('player:follow', ids, player.userId)
      }
      return api.call<{ userId: number; error: string }[]>('launch:player', ids, player.userId)
    })
    setPlayerAction(null)
    if (!failed) return
    if (action !== 'join') setRelationshipReload((value) => value + 1)

    if (failed.length) {
      toast('err', `${failed.length} of ${targetAccounts.length} failed — ${failed[0].error}`)
    } else {
      const name = player.displayName || player.username
      const message =
        action === 'friend'
          ? `Friend request sent to ${name}`
          : action === 'follow'
            ? `Now following ${name}`
            : `Join requested for ${name}`
      toast('ok', message)
    }
  }

  async function joinAccount(targetUserId: number) {
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
                onClick={() => {
                  void patchSettings({ lastPlaceId: numericPlace })
                  setTab('servers')
                }}
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

      <Section
        title="Recently played"
        hint={
          recentAccount
            ? `The 8 latest experiences from ${recentAccount.alias || recentAccount.username}`
            : 'Select an account to see its recent experiences'
        }
        actions={
          accounts.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <label className="sr-only" htmlFor="recent-account">
                Account for recent games
              </label>
              <select
                id="recent-account"
                className="field !h-[28px] !w-[170px] !py-0 !text-[11.5px]"
                value={recentAccountId ?? ''}
                onChange={(e) => setRecentAccountId(Number(e.target.value))}
              >
                {accounts.map((a) => (
                  <option key={a.userId} value={a.userId}>
                    {a.alias || a.username}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Refresh recent games"
                title="Refresh recent games"
                className="btn btn-ghost h-[28px] w-[28px] !px-0"
                onClick={() => setRecentReload((value) => value + 1)}
                disabled={recentLoading || !recentAccount}
              >
                <RefreshCw size={13} strokeWidth={1.9} className={recentLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          ) : null
        }
      >
        {recentLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex h-[52px] items-center gap-2.5 rounded-[10px] bg-[var(--color-raised)] p-2">
                <div className="h-8 w-8 shrink-0 animate-pulse rounded-[8px] bg-[var(--color-hover)]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-2.5 w-3/4 animate-pulse rounded bg-[var(--color-hover)]" />
                  <div className="h-2 w-1/2 animate-pulse rounded bg-[var(--color-hover)]" />
                </div>
              </div>
            ))}
          </div>
        ) : recentError ? (
          <div className="flex items-center gap-2.5 rounded-[10px] bg-[var(--color-raised)] p-3">
            <Clock3 size={16} strokeWidth={1.75} className="shrink-0 text-[var(--color-faint)]" />
            <span className="min-w-0 flex-1 text-[12px] text-[var(--color-dim)]">{recentError}</span>
            <Button className="!h-[27px] shrink-0 !text-[12px]" onClick={() => setRecentReload((value) => value + 1)}>
              Retry
            </Button>
          </div>
        ) : recentGames.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-[10px] bg-[var(--color-raised)] p-3">
            <Clock3 size={16} strokeWidth={1.75} className="shrink-0 text-[var(--color-faint)]" />
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold">No recent experiences found</div>
              <div className="text-[11.5px] text-[var(--color-faint)]">Play a game on this account and refresh this list.</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
            {recentGames.map((game) => {
              const favourite = presets.some((p) => p.placeId === game.placeId)
              const context = [
                game.lastPlayedAt ? relative(game.lastPlayedAt) : null,
                game.creator ? `by ${game.creator}` : null,
                game.playing >= 0 ? `${game.playing.toLocaleString()} playing` : null
              ]
                .filter((item): item is string => !!item)
                .join(' · ')
              return (
                <div
                  key={`${game.universeId}-${game.placeId}`}
                  className="group flex min-w-0 items-center gap-2 rounded-[10px] bg-[var(--color-raised)] p-2 transition-[background-color,scale] duration-150 ease-[var(--ease-out)] hover:bg-[var(--color-hover)]"
                >
                  {game.iconUrl ? (
                    <img src={game.iconUrl} alt="" width={32} height={32} className="avatar h-8 w-8 shrink-0 rounded-[8px]" />
                  ) : (
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[var(--color-hover)] text-[var(--color-faint)]">
                      <Bookmark size={14} strokeWidth={1.75} />
                    </div>
                  )}
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-start"
                    title={`Use ${game.name} in the launcher${context ? ` · ${context}` : ''}`}
                    onClick={() => useRecent(game)}
                  >
                    <span className="block truncate text-[12.5px] font-semibold">{game.name}</span>
                    <span className="block truncate text-[11px] text-[var(--color-faint)]">{context || 'Recently played'}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={favourite ? `Remove ${game.name} from favourites` : `Favourite ${game.name}`}
                    title={favourite ? 'Remove from favourites' : 'Add to favourites'}
                    className="grid h-[27px] w-[27px] shrink-0 place-items-center rounded-[8px] text-[var(--color-faint)] transition-[background-color,color,scale] duration-150 ease-[var(--ease-out)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] active:scale-[0.96]"
                    onClick={() => void toggleRecentFavourite(game)}
                  >
                    <Star
                      size={13}
                      strokeWidth={2}
                      fill={favourite ? 'currentColor' : 'none'}
                      style={{ color: favourite ? 'var(--color-warn)' : 'currentColor' }}
                    />
                  </button>
                  <button
                    type="button"
                    aria-label={`Launch ${game.name}`}
                    title="Launch"
                    className="grid h-[27px] w-[27px] shrink-0 place-items-center rounded-[8px] bg-[var(--color-accent)] text-white transition-[background-color,scale] duration-150 ease-[var(--ease-out)] hover:bg-[oklch(0.7_0.196_288)] active:scale-[0.96] disabled:opacity-40"
                    onClick={() => void launchRecent(game)}
                    disabled={!usable.length && (!recentAccount || recentExpired || !recentHasCookie)}
                  >
                    <Play size={12} strokeWidth={2.5} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section
        title="Player actions"
        hint="Find a player by username or User ID, then act with the selected accounts"
      >
        <div className="grid gap-2.5">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <UserRoundSearch
                size={14}
                strokeWidth={1.75}
                className="pointer-events-none absolute inset-y-0 my-auto ms-2.5 text-[var(--color-faint)]"
              />
              <Input
                className="!ps-8"
                placeholder="Username or User ID"
                value={playerQuery}
                onChange={(e) => {
                  setPlayerQuery(e.target.value)
                  setPlayer(null)
                  setPlayerError(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && void lookupPlayer()}
                spellCheck={false}
              />
            </div>
            <Button
              loading={playerLoading}
              onClick={() => void lookupPlayer()}
              disabled={!playerQuery.trim()}
            >
              Find player
            </Button>
          </div>

          {playerError ? (
            <div className="flex items-center gap-2 rounded-[10px] bg-[var(--color-raised)] px-3 py-2.5 text-[12px] text-[var(--color-dim)]">
              <UserRoundSearch size={15} strokeWidth={1.75} className="shrink-0 text-[var(--color-faint)]" />
              <span>{playerError}</span>
            </div>
          ) : null}

          {player ? (
            <div className="grid gap-2.5">
              <div className="flex items-center gap-3 rounded-[10px] bg-[var(--color-raised)] p-2.5">
                {player.avatarUrl ? (
                  <img src={player.avatarUrl} alt="" width={36} height={36} className="avatar h-9 w-9 rounded-full" />
                ) : (
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-hover)] text-[var(--color-faint)]">
                    <UserRoundSearch size={16} strokeWidth={1.75} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{player.displayName || player.username}</div>
                  <div className="num truncate text-[11.5px] text-[var(--color-faint)]">
                    @{player.username} · {player.userId}
                  </div>
                </div>
                <span className="shrink-0 text-[11.5px] text-[var(--color-faint)]">
                  {socialAccounts.length} account{socialAccounts.length === 1 ? '' : 's'} ready
                </span>
              </div>
              {relationshipFailure ? (
                <div className="flex items-center gap-2 rounded-[10px] bg-[var(--color-raised)] px-3 py-2 text-[11.5px] text-[var(--color-dim)]">
                  <span className="min-w-0 flex-1">Could not check the current friend/follow status: {relationshipFailure}</span>
                  <Button
                    type="button"
                    className="!h-[26px] shrink-0 !text-[11.5px]"
                    onClick={() => setRelationshipReload((value) => value + 1)}
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[11.5px] text-[var(--color-faint)]">
                  <span>
                    {relationshipLoading
                      ? 'Checking relationship status…'
                      : socialAccounts.length
                        ? `${friendCount}/${socialAccounts.length} friends${pendingFriendCount ? ` · ${pendingFriendCount}/${socialAccounts.length} pending` : ''}${incomingFriendCount ? ` · ${incomingFriendCount}/${socialAccounts.length} incoming` : ''} · ${followingCount}/${socialAccounts.length} following`
                        : 'Select an account with a saved session to use these actions'}
                  </span>
                  {socialAccounts.length ? (
                    <button
                      type="button"
                      aria-label="Refresh relationship status"
                      title="Refresh relationship status"
                      disabled={relationshipLoading}
                      onClick={() => setRelationshipReload((value) => value + 1)}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--color-faint)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] disabled:pointer-events-none disabled:opacity-50"
                    >
                      <RefreshCw size={13} strokeWidth={1.9} className={relationshipLoading ? 'animate-spin' : ''} />
                    </button>
                  ) : null}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  loading={playerAction === 'friend'}
                  disabled={
                    !socialAccounts.length || playerAction !== null || relationshipLoading || !!relationshipFailure || !relationshipsReady || !friendTargets.length
                  }
                  onClick={() => void actOnPlayer('friend')}
                >
                  <UserPlus size={14} strokeWidth={1.9} />
                  {relationshipLoading ? 'Checking…' : friendButtonLabel}
                </Button>
                <Button
                  type="button"
                  loading={playerAction === 'follow'}
                  disabled={
                    !socialAccounts.length || playerAction !== null || relationshipLoading || !!relationshipFailure || !relationshipsReady || !followTargets.length
                  }
                  onClick={() => void actOnPlayer('follow')}
                >
                  <HeartHandshake size={14} strokeWidth={1.9} />
                  {relationshipLoading
                    ? 'Checking…'
                    : followingCount === socialAccounts.length && socialAccounts.length
                      ? 'Following'
                      : 'Follow'}
                </Button>
                <Button
                  type="button"
                  loading={playerAction === 'join'}
                  disabled={!socialAccounts.length || playerAction !== null}
                  onClick={() => void actOnPlayer('join')}
                >
                  <Rocket size={14} strokeWidth={1.9} />
                  Join server
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Section>

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
                <Button className="!h-[28px] !text-[12px]" onClick={() => void joinAccount(a.userId)} disabled={!usable.length}>
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
