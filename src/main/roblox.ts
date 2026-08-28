import { randomUUID } from 'node:crypto'
import type { GameServer, Moderation, PlayerFriendStatus, PlayerProfile, PlayerRelationship, Presence, RecentGame } from '@shared/types'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const TIMEOUT_MS = 20_000

const csrfTokens = new Map<string, string>()
const csrfKey = (cookie?: string): string => (cookie ? cookie.slice(-24) : 'anon')

class RobloxError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

interface Req {
  method?: 'GET' | 'POST'
  cookie?: string
  body?: unknown
  headers?: Record<string, string>
  redirect?: RequestRedirect
}

async function call(url: string, opts: Req = {}, attempt = 0): Promise<Response> {
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Referer: 'https://www.roblox.com/',
    Origin: 'https://www.roblox.com',
    'Accept-Language': 'en-US,en;q=0.9'
  }
  const key = csrfKey(opts.cookie)
  const token = csrfTokens.get(key)
  if (opts.cookie) headers.Cookie = `.ROBLOSECURITY=${opts.cookie}`
  if (token) headers['x-csrf-token'] = token
  if (opts.method === 'POST') headers['Content-Type'] = 'application/json'
  Object.assign(headers, opts.headers)

  let res: Response
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      redirect: opts.redirect ?? 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (e) {
    const name = (e as Error)?.name
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new RobloxError(408, 'Roblox did not answer in time — check your connection and try again')
    }
    throw e
  }

  if (res.status === 403) {
    const fresh = res.headers.get('x-csrf-token')
    if (fresh && fresh !== token && attempt < 2) {
      while (csrfTokens.size > 64) csrfTokens.delete(csrfTokens.keys().next().value as string)
      csrfTokens.set(key, fresh)
      return call(url, opts, attempt + 1)
    }
  }
  if (res.status === 429 && attempt < 4) {
    await new Promise((r) => setTimeout(r, 600 * 2 ** attempt))
    return call(url, opts, attempt + 1)
  }
  return res
}

async function json<T>(url: string, opts: Req = {}): Promise<T> {
  const res = await call(url, opts)
  if (!res.ok) throw new RobloxError(res.status, await responseMessage(res))
  return (await res.json()) as T
}

async function responseMessage(res: Response): Promise<string> {
  const raw = await res.text()
  try {
    const body = JSON.parse(raw) as { message?: unknown; errors?: unknown }
    if (Array.isArray(body.errors)) {
      const message = body.errors.find(
        (item): item is { message: string } =>
          !!item && typeof item === 'object' && 'message' in item && typeof item.message === 'string' && !!item.message.trim()
      )?.message
      if (message) return message
    }
    if (typeof body.message === 'string' && body.message.trim()) return body.message.trim()
  } catch {}
  return raw.slice(0, 300) || res.statusText
}

export async function validate(cookie: string): Promise<{ userId: number; username: string; displayName: string }> {
  const u = await json<{ id: number; name: string; displayName: string }>(
    'https://users.roblox.com/v1/users/authenticated',
    { cookie }
  )
  return { userId: u.id, username: u.name, displayName: u.displayName }
}

export async function authTicket(cookie: string): Promise<string> {
  const res = await call('https://auth.roblox.com/v1/authentication-ticket', { method: 'POST', cookie })
  const ticket = res.headers.get('rbx-authentication-ticket')
  if (!ticket) throw new RobloxError(res.status, 'Roblox refused to issue a launch ticket — the cookie may be expired')
  return ticket
}

export async function refreshCookie(cookie: string): Promise<string | null> {
  const ticket = await authTicket(cookie)
  const res = await call('https://auth.roblox.com/v1/authentication-ticket/redeem', {
    method: 'POST',
    cookie,
    body: { authenticationTicket: ticket },
    headers: { RBXAuthenticationNegotiation: '1' },
    redirect: 'manual'
  })

  for (const line of res.headers.getSetCookie()) {
    const m = line.match(/\.ROBLOSECURITY=([^;]+)/)
    if (m && m[1].length > 200 && m[1] !== cookie) return m[1]
  }
  return null
}

export interface QuickLogin {
  deviceInfo?: string
  location?: string
}

const AUTH_TOKEN = 'https://apis.roblox.com/auth-token-service/v1/login'

export async function quickLoginCode(cookie: string, code: string): Promise<QuickLogin> {
  return json<QuickLogin>(`${AUTH_TOKEN}/enterCode`, { method: 'POST', cookie, body: { code } })
}

export async function quickLoginConfirm(cookie: string, code: string): Promise<void> {
  await json(`${AUTH_TOKEN}/validateCode`, { method: 'POST', cookie, body: { code } })
}

export interface LoginCode {
  code: string
  privateKey: string
  expirationTime: string
}

export async function createLoginCode(): Promise<LoginCode> {
  return json<LoginCode>(`${AUTH_TOKEN}/create`, { method: 'POST', body: {} })
}

export async function loginQr(code: string, privateKey: string): Promise<string> {
  const res = await call(
    `${AUTH_TOKEN}/qr-code-image?key=${encodeURIComponent(privateKey)}&code=${encodeURIComponent(code)}`
  )
  if (!res.ok) return ''
  return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
}

export interface LoginStatus {
  status: 'Created' | 'UserLinked' | 'Validated' | 'Cancelled' | string
  accountName?: string | null
}

export async function loginStatus(code: string, privateKey: string): Promise<LoginStatus> {
  return json<LoginStatus>(`${AUTH_TOKEN}/status`, { method: 'POST', body: { code, privateKey } })
}

export async function redeemLoginCode(code: string, privateKey: string): Promise<string> {
  const res = await call('https://auth.roblox.com/v2/login', {
    method: 'POST',
    body: { ctype: 'AuthToken', cvalue: code, password: privateKey }
  })
  if (!res.ok) throw new RobloxError(res.status, (await res.text()).slice(0, 300) || res.statusText)
  for (const line of res.headers.getSetCookie()) {
    const m = line.match(/\.ROBLOSECURITY=([^;]+)/)
    if (m && m[1].length > 200) return m[1]
  }
  throw new RobloxError(res.status, 'Roblox accepted the approval but did not hand back a session')
}

export async function avatars(userIds: number[]): Promise<Record<number, string>> {
  if (!userIds.length) return {}
  const out: Record<number, string> = {}
  for (let i = 0; i < userIds.length; i += 100) {
    const chunk = userIds.slice(i, i + 100)
    const r = await json<{ data: { targetId: number; imageUrl?: string }[] }>(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${chunk.join(',')}&size=150x150&format=Png&isCircular=false`
    )
    for (const e of r.data) if (e.imageUrl) out[e.targetId] = e.imageUrl
  }
  return out
}

export async function presences(cookie: string, userIds: number[]): Promise<Record<number, Presence>> {
  if (!userIds.length) return {}
  const r = await json<{
    userPresences: {
      userId: number
      userPresenceType: number
      placeId?: number
      gameId?: string
      universeId?: number
      lastLocation?: string
    }[]
  }>('https://presence.roblox.com/v1/presence/users', { method: 'POST', cookie, body: { userIds } })
  const out: Record<number, Presence> = {}
  for (const p of r.userPresences) {
    out[p.userId] = {
      type: (p.userPresenceType ?? 0) as Presence['type'],
      placeId: p.placeId,
      gameId: p.gameId,
      universeId: p.universeId,
      lastLocation: p.lastLocation ?? ''
    }
  }
  return out
}

export async function balance(cookie: string, userId: number): Promise<number> {
  const r = await json<{ robux: number }>(`https://economy.roblox.com/v1/users/${userId}/currency`, { cookie })
  return r.robux
}

export async function universeOf(placeId: number): Promise<number | undefined> {
  try {
    const r = await json<{ universeId: number }>(
      `https://apis.roblox.com/universes/v1/places/${placeId}/universe`
    )
    return r.universeId
  } catch {
    return undefined
  }
}

export async function gameInfo(
  universeId: number
): Promise<{ name: string; playing: number; icon?: string; rootPlaceId?: number }> {
  const [g, icons] = await Promise.all([
    json<{ data: { name: string; playing: number; rootPlaceId?: number }[] }>(
      `https://games.roblox.com/v1/games?universeIds=${universeId}`
    ),
    json<{ data: { imageUrl?: string }[] }>(
      `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`
    ).catch(() => ({ data: [] as { imageUrl?: string }[] }))
  ])
  const d = g.data[0]
  if (!d) throw new RobloxError(404, 'Experience not found')
  return { name: d.name, playing: d.playing, icon: icons.data[0]?.imageUrl, rootPlaceId: d.rootPlaceId }
}

export interface GameHit {
  universeId: number
  placeId: number
  name: string
  creator: string
  playing: number
  icon?: string
}

export async function gameIcons(universeIds: number[]): Promise<Record<number, string>> {
  if (!universeIds.length) return {}
  const r = await json<{ data: { targetId: number; imageUrl?: string }[] }>(
    `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeIds.join(',')}&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false`
  ).catch(() => ({ data: [] as { targetId: number; imageUrl?: string }[] }))
  const out: Record<number, string> = {}
  for (const e of r.data) if (e.imageUrl) out[e.targetId] = e.imageUrl
  return out
}

export async function searchGames(query: string): Promise<GameHit[]> {
  const sessionId = randomUUID()
  const url =
    'https://apis.roblox.com/search-api/omni-search?' +
    new URLSearchParams({ verticalType: 'game', searchQuery: query, pageType: 'all', sessionId }).toString()

  const r = await json<{
    searchResults?: {
      contents?: {
        universeId: number
        rootPlaceId?: number
        name: string
        creatorName?: string
        playerCount?: number
      }[]
    }[]
  }>(url)

  const hits = (r.searchResults ?? [])
    .flatMap((g) => g.contents ?? [])
    .filter((c) => c.universeId)
    .slice(0, 60)

  const missing = hits.filter((h) => !h.rootPlaceId).map((h) => h.universeId)
  const resolved: Record<number, number> = {}
  if (missing.length) {
    const details = await json<{ data: { id: number; rootPlaceId?: number }[] }>(
      `https://games.roblox.com/v1/games?universeIds=${missing.slice(0, 50).join(',')}`
    ).catch(() => ({ data: [] as { id: number; rootPlaceId?: number }[] }))
    for (const d of details.data) if (d.rootPlaceId) resolved[d.id] = d.rootPlaceId
  }

  const icons = await gameIcons(hits.map((h) => h.universeId))

  return hits
    .map((h) => ({
      universeId: h.universeId,
      placeId: h.rootPlaceId ?? resolved[h.universeId] ?? 0,
      name: h.name,
      creator: h.creatorName ?? '',
      playing: h.playerCount ?? 0,
      icon: icons[h.universeId]
    }))
    .filter((h) => h.placeId > 0)
}

interface RecentSort {
  sortDisplayName?: unknown
  sortId?: unknown
  contentType?: unknown
  games?: unknown[]
  recommendationList?: unknown[]
}

interface RecentFeed {
  sorts?: RecentSort[]
  contentMetadata?: Record<string, Record<string, unknown>>
}

interface RecentCandidate {
  universeId: number
  placeId: number
  name: string
  creator: string
  playing: number
  iconUrl?: string
  lastPlayedAt?: string
}

function asNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    if (Number.isSafeInteger(n) && n > 0) return n
  }
  return undefined
}

function asCount(...values: unknown[]): number | undefined {
  for (const value of values) {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    if (Number.isSafeInteger(n) && n >= 0) return n
  }
  return undefined
}

function asText(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function asIso(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const at = Date.parse(value)
    return Number.isFinite(at) ? new Date(at).toISOString() : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value < 1e12 ? value * 1000 : value
    const at = new Date(millis).getTime()
    return Number.isFinite(at) ? new Date(at).toISOString() : undefined
  }
  return undefined
}

function candidateOf(value: unknown): RecentCandidate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const game = value as Record<string, unknown>
  const universeId = asNumber(game.universeId, game.UniverseId)
  const placeId = asNumber(game.placeId, game.rootPlaceId, game.PlaceId, game.RootPlaceId) ?? 0
  const name = asText(game.name, game.displayName, game.Name, game.DisplayName)
  if (!universeId || !name) return null

  const creatorValue = game.creator
  const creatorObject = creatorValue && typeof creatorValue === 'object' ? (creatorValue as Record<string, unknown>) : {}
  const playingValue = asCount(game.playerCount, game.playing, game.Playing)

  return {
    universeId,
    placeId,
    name,
    creator: asText(game.creatorName, game.CreatorName, creatorValue, creatorObject.name, creatorObject.displayName) ?? '',
    playing: playingValue ?? -1,
    iconUrl: asText(game.iconUrl, game.imageUrl, game.thumbnailUrl),
    lastPlayedAt: asIso(game.lastPlayedAt ?? game.lastPlayed ?? game.LastPlayedAt ?? game.LastPlayed)
  }
}

function recentGamesInFeed(feed: RecentFeed): RecentCandidate[] {
  const sorts = Array.isArray(feed.sorts) ? feed.sorts : []
  const sort = sorts.find((item) => {
    const label = [item.sortDisplayName, item.sortId, item.contentType].filter((v) => typeof v === 'string').join(' ').toLowerCase()
    const games = Array.isArray(item.games) ? item.games : []
    const recommendations = Array.isArray(item.recommendationList) ? item.recommendationList : []
    return (games.length > 0 || recommendations.length > 0) && /recent|visited|continu|played|jog/.test(label)
  })
  if (!sort) return []

  const direct = Array.isArray(sort.games) ? sort.games : []
  const referenced = Array.isArray(sort.recommendationList)
    ? sort.recommendationList
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null
          const ref = item as Record<string, unknown>
          if (candidateOf(ref)) return ref
          const type = asText(ref.contentType)
          const id = asText(ref.contentId)
          return type && id ? feed.contentMetadata?.[type]?.[id] : null
        })
        .filter((item): item is Record<string, unknown> => !!item)
    : []

  const seen = new Set<number>()
  return [...direct, ...referenced]
    .map(candidateOf)
    .filter((item): item is RecentCandidate => {
      if (!item || seen.has(item.universeId)) return false
      seen.add(item.universeId)
      return true
    })
}

async function enrichRecentGames(candidates: RecentCandidate[]): Promise<RecentGame[]> {
  if (!candidates.length) return []

  const missing = candidates.filter((game) => !game.placeId).map((game) => game.universeId)
  const roots: Record<number, number> = {}
  if (missing.length) {
    const details = await json<{ data: { id: number; rootPlaceId?: number }[] }>(
      `https://games.roblox.com/v1/games?universeIds=${missing.slice(0, 50).join(',')}`
    ).catch(() => ({ data: [] as { id: number; rootPlaceId?: number }[] }))
    for (const game of details.data) if (game.rootPlaceId) roots[game.id] = game.rootPlaceId
  }

  const icons = await gameIcons(candidates.map((game) => game.universeId))
  return candidates
    .map((game) => ({
      ...game,
      placeId: game.placeId || roots[game.universeId] || 0,
      iconUrl: game.iconUrl || icons[game.universeId]
    }))
    .filter((game) => game.placeId > 0)
    .slice(0, 8)
}

export async function recentGames(cookie: string): Promise<RecentGame[]> {
  const sessionId = randomUUID()
  const search = await json<RecentFeed>(
    `https://apis.roblox.com/search-landing-page-api/v1?sessionId=${encodeURIComponent(sessionId)}`,
    { cookie }
  ).catch(() => null)
  let candidates = search ? recentGamesInFeed(search) : []

  if (!candidates.length) {
    const discovery = await json<RecentFeed>('https://apis.roblox.com/discovery-api/omni-recommendation', {
      method: 'POST',
      cookie,
      body: {
        pageType: 'Home',
        sessionId,
        supportedTreatmentTypes: ['SortlessGrid']
      }
    })
    candidates = recentGamesInFeed(discovery)
  }

  return enrichRecentGames(candidates)
}

export async function servers(
  cookie: string,
  placeId: number,
  cursor?: string,
  sort: 'Asc' | 'Desc' = 'Asc'
): Promise<{ list: GameServer[]; cursor?: string }> {
  const url =
    `https://games.roblox.com/v1/games/${placeId}/servers/0?sortOrder=${sort}&limit=100` +
    (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '')
  const r = await json<{ data: GameServer[]; nextPageCursor?: string }>(url, { cookie })
  return { list: r.data, cursor: r.nextPageCursor ?? undefined }
}

export async function lookupUsername(
  username: string
): Promise<{ userId: number; username: string; displayName: string } | null> {
  const r = await json<{ data: { id: number; name: string; displayName: string }[] }>(
    'https://users.roblox.com/v1/usernames/users',
    { method: 'POST', body: { usernames: [username], excludeBannedUsers: false } }
  )
  const e = r.data[0]
  return e ? { userId: e.id, username: e.name, displayName: e.displayName } : null
}

export async function lookupPlayer(query: string): Promise<PlayerProfile | null> {
  const trimmed = query.trim()
  if (!trimmed) return null

  let player: Omit<PlayerProfile, 'avatarUrl'> | null
  if (/^\d+$/.test(trimmed)) {
    const userId = Number(trimmed)
    if (!Number.isSafeInteger(userId) || userId <= 0) return null
    try {
      const user = await json<{ id: number; name: string; displayName: string }>(
        `https://users.roblox.com/v1/users/${userId}`
      )
      player = { userId: user.id, username: user.name, displayName: user.displayName }
    } catch (error) {
      if (error instanceof RobloxError && error.status === 404) return null
      throw error
    }
  } else {
    player = await lookupUsername(trimmed)
  }

  if (!player) return null
  const avatarsByUser = await avatars([player.userId]).catch(() => ({} as Record<number, string>))
  return { ...player, avatarUrl: avatarsByUser[player.userId] }
}

async function ensureOk(url: string, opts: Req = {}): Promise<void> {
  const res = await call(url, opts)
  if (!res.ok) throw new RobloxError(res.status, await responseMessage(res))
}

export async function sendFriendRequest(cookie: string, targetUserId: number): Promise<void> {
  if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) throw new RobloxError(400, 'That is not a valid User ID')
  await ensureOk(`https://friends.roblox.com/v1/users/${targetUserId}/request-friendship`, {
    method: 'POST',
    cookie,
    body: {}
  })
}

export async function followPlayer(cookie: string, targetUserId: number): Promise<void> {
  if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) throw new RobloxError(400, 'That is not a valid User ID')
  await ensureOk(`https://friends.roblox.com/v1/users/${targetUserId}/follow`, {
    method: 'POST',
    cookie,
    body: {}
  })
}

export async function playerRelationship(
  cookie: string,
  userId: number,
  targetUserId: number
): Promise<Pick<PlayerRelationship, 'friendStatus' | 'isFriend' | 'isFollowing'>> {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
    throw new RobloxError(400, 'That is not a valid User ID')
  }

  const [friendStatus, following] = await Promise.all([
    json<{ data?: { id?: number | string; status?: string }[] }>(
      `https://friends.roblox.com/v1/users/${userId}/friends/statuses?userIds[]=${encodeURIComponent(targetUserId)}`,
      { cookie }
    ),
    json<{ followings?: { userId: number; isFollowing?: boolean }[] }>('https://friends.roblox.com/v1/user/following-exists', {
      method: 'POST',
      cookie,
      body: { targetUserIds: [targetUserId] }
    })
  ])

  const rawStatus = friendStatus.data?.find((entry) => Number(entry.id) === targetUserId)?.status
  const statusKey = rawStatus?.replace(/[\s_-]/g, '').toLowerCase()
  const normalizedStatus: PlayerFriendStatus =
    statusKey === 'friends' || statusKey === 'friend'
      ? 'friend'
      : statusKey === 'requestsent' || statusKey === 'pending' || statusKey === 'outgoingrequest'
        ? 'pending'
        : statusKey === 'requestreceived' || statusKey === 'incomingrequest'
          ? 'incoming'
          : statusKey === 'notfriends' || statusKey === 'notfriend' || statusKey === 'none'
            ? 'none'
            : (() => {
                throw new RobloxError(502, 'Roblox returned an unknown friend status')
              })()

  return {
    friendStatus: normalizedStatus,
    isFriend: normalizedStatus === 'friend',
    isFollowing: !!following.followings?.find((entry) => Number(entry.userId) === targetUserId)?.isFollowing
  }
}

export async function resolveShareLink(
  cookie: string,
  code: string
): Promise<{ placeId: number; universeId?: number; linkCode: string; accessCode: string }> {
  const r = await json<{
    privateServerInviteData?: { placeId: number; universeId?: number; linkCode: string; status: string }
  }>('https://apis.roblox.com/sharelinks/v1/resolve-link', {
    method: 'POST',
    cookie,
    body: { linkId: code, linkType: 'Server' }
  })
  const d = r.privateServerInviteData
  if (!d) throw new RobloxError(400, 'That share link is not a private server invite')
  if (d.status !== 'Valid') throw new RobloxError(400, `Invite is ${d.status.toLowerCase()}`)
  const accessCode = await scrapeAccessCode(cookie, d.placeId, d.linkCode)
  return { placeId: d.placeId, universeId: d.universeId, linkCode: d.linkCode, accessCode }
}

export async function scrapeAccessCode(cookie: string, placeId: number, linkCode: string): Promise<string> {
  const res = await call(`https://www.roblox.com/games/${placeId}/game?privateServerLinkCode=${linkCode}`, { cookie })
  const html = await res.text()
  const m = html.match(
    /joinPrivateGame\(\s*\d+\s*,\s*['"]([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})['"]/
  )
  if (!m) throw new RobloxError(400, 'Could not read the access code from that private server page')
  return m[1]
}

export async function moderation(cookie: string, userId: number): Promise<Moderation | undefined> {
  const banned = await json<{ isBanned?: boolean }>(`https://users.roblox.com/v1/users/${userId}`)
    .then((r) => !!r.isBanned)
    .catch(() => false)

  const v1 = await json<{ messageToUser?: string; endDate?: string }>(
    'https://usermoderation.roblox.com/v1/not-approved',
    { cookie }
  ).catch(() => null)
  const v2 = await json<{ restriction?: { endTime?: string; durationSeconds?: number } }>(
    'https://usermoderation.roblox.com/v2/not-approved',
    { cookie }
  ).catch(() => null)

  const reason = v1?.messageToUser?.trim() || undefined
  if (!banned && !reason) return undefined

  let expiresAt: string | undefined
  const r = v2?.restriction
  if (r?.endTime) expiresAt = new Date(r.endTime).toISOString()
  else if (r?.durationSeconds && r.durationSeconds > 0)
    expiresAt = new Date(Date.now() + r.durationSeconds * 1000).toISOString()
  else if (v1?.endDate) expiresAt = new Date(v1.endDate).toISOString()

  return { banned, reason, expiresAt, checkedAt: new Date().toISOString() }
}

export async function friendServer(
  cookie: string,
  userId: number
): Promise<{ placeId: number; gameId: string } | null> {
  const p = await presences(cookie, [userId])
  const it = p[userId]
  return it?.placeId && it.gameId ? { placeId: it.placeId, gameId: it.gameId } : null
}
