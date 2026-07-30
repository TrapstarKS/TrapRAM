import { randomUUID } from 'node:crypto'
import type { GameServer, Moderation, Presence } from '@shared/types'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

let csrf = ''

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
  if (opts.cookie) headers.Cookie = `.ROBLOSECURITY=${opts.cookie}`
  if (csrf) headers['x-csrf-token'] = csrf
  if (opts.method === 'POST') headers['Content-Type'] = 'application/json'
  Object.assign(headers, opts.headers)

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    redirect: opts.redirect ?? 'follow'
  })

  if (res.status === 403) {
    const token = res.headers.get('x-csrf-token')
    if (token && token !== csrf && attempt < 2) {
      csrf = token
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
  if (!res.ok) throw new RobloxError(res.status, (await res.text()).slice(0, 300) || res.statusText)
  return (await res.json()) as T
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
