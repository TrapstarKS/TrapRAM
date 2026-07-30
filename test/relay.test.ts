import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../worker/src/index.js'

const ROOM = 'a'.repeat(32)
const URL_BASE = `https://relay.test/r/${ROOM}`

function env() {
  const store = new Map<string, string>()
  return {
    SYNC: {
      get: async (key: string, type?: string) => {
        const raw = store.get(key)
        if (raw === undefined) return null
        return type === 'json' ? JSON.parse(raw) : raw
      },
      put: async (key: string, value: string) => void store.set(key, value),
      delete: async (key: string) => void store.delete(key)
    }
  }
}

const put = (e: ReturnType<typeof env>, blob: string, ifMatch: number) =>
  worker.fetch(new Request(URL_BASE, { method: 'PUT', body: blob, headers: { 'if-match': String(ifMatch) } }), e)

test('the relay identifies itself so a wrong URL is caught at setup', async () => {
  const res = await worker.fetch(new Request('https://relay.test/'), env())
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { relay: 'trapram', v: 1 })
})

test('an empty room reads as missing, not as an empty vault', async () => {
  const res = await worker.fetch(new Request(URL_BASE), env())
  assert.equal(res.status, 404)
})

test('a blob round-trips and the version advances', async () => {
  const e = env()
  assert.deepEqual(await (await put(e, 'aGVsbG8=', 0)).json(), { v: 1 })

  const res = await worker.fetch(new Request(URL_BASE), e)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { v: 1, blob: 'aGVsbG8=' })
  assert.equal(res.headers.get('etag'), '"1"')
})

test('a device writing against a version it did not read is refused', async () => {
  const e = env()
  await put(e, 'aGVsbG8=', 0)
  assert.equal((await put(e, 'd29ybGQ=', 0)).status, 409)
  assert.equal((await put(e, 'd29ybGQ=', 1)).status, 200)

  assert.equal((await (await worker.fetch(new Request(URL_BASE), e)).json()).blob, 'd29ybGQ=')
})

test('a PUT with no version header is treated as stale, never as a first write', async () => {
  const e = env()
  await put(e, 'aGVsbG8=', 0)
  const res = await worker.fetch(new Request(URL_BASE, { method: 'PUT', body: 'd29ybGQ=' }), e)
  assert.equal(res.status, 409)
})

test('an unchanged room answers 304 so nothing is downloaded twice', async () => {
  const e = env()
  await put(e, 'aGVsbG8=', 0)
  const res = await worker.fetch(new Request(URL_BASE, { headers: { 'if-none-match': '"1"' } }), e)
  assert.equal(res.status, 304)
})

test('the relay refuses anything that is not a base64 body', async () => {
  assert.equal((await put(env(), 'not base64!', 0)).status, 400)
})

test('deleting a room really empties it', async () => {
  const e = env()
  await put(e, 'aGVsbG8=', 0)
  assert.equal((await worker.fetch(new Request(URL_BASE, { method: 'DELETE' }), e)).status, 204)
  assert.equal((await worker.fetch(new Request(URL_BASE), e)).status, 404)
})

test('rooms are not browsable', async () => {
  const e = env()
  assert.equal((await worker.fetch(new Request('https://relay.test/r/short'), e)).status, 404)
  assert.equal((await worker.fetch(new Request('https://relay.test/admin'), e)).status, 404)
  assert.equal((await worker.fetch(new Request(URL_BASE, { method: 'POST', body: 'x' }), e)).status, 405)
})
