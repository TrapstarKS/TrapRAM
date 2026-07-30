

const ROOM = /^\/r\/([a-f0-9]{32})$/
const MAX_BLOB = 4 * 1024 * 1024
const TTL_SECONDS = 60 * 24 * 60 * 60

const json = (body, init) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers }
  })

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/') return json({ relay: 'trapram', v: 1 })

    const match = ROOM.exec(url.pathname)
    if (!match) return new Response(null, { status: 404 })
    const key = `r:${match[1]}`

    if (request.method === 'GET') {
      const record = await env.SYNC.get(key, 'json')
      if (!record) return new Response(null, { status: 404 })
      const etag = `"${record.v}"`
      if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304 })
      return json(record, { headers: { etag } })
    }

    if (request.method === 'PUT') {
      const blob = await request.text()
      if (blob.length > MAX_BLOB) return new Response(null, { status: 413 })
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(blob)) return new Response(null, { status: 400 })

      const record = await env.SYNC.get(key, 'json')
      const current = record?.v ?? 0

      if (Number(request.headers.get('if-match')) !== current) return new Response(null, { status: 409 })

      const next = { v: current + 1, blob }
      await env.SYNC.put(key, JSON.stringify(next), { expirationTtl: TTL_SECONDS })
      return json({ v: next.v })
    }

    if (request.method === 'DELETE') {
      await env.SYNC.delete(key)
      return new Response(null, { status: 204 })
    }

    return new Response(null, { status: 405, headers: { allow: 'GET, PUT, DELETE' } })
  }
}
