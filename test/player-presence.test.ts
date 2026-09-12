import { test } from 'node:test'
import assert from 'node:assert/strict'
import { playerServer } from '../src/shared/plain.ts'
import type { Presence } from '../src/shared/types.ts'

const inGame: Presence = { type: 2, lastLocation: 'Blox Fruits', placeId: 2753915549, gameId: 'server-a' }

test('joining requires an in-game presence with a valid place and shared server', () => {
  assert.deepEqual(playerServer(inGame), { placeId: 2753915549, gameId: 'server-a' })
  assert.equal(playerServer(), null)
  for (const patch of [
    { type: 0 }, { type: 1 }, { type: 3 }, { type: 4 },
    { placeId: 0 }, { placeId: -1 }, { placeId: 1.5 }, { placeId: Number.MAX_SAFE_INTEGER + 1 },
    { placeId: null }, { placeId: '123' }, { gameId: '' }, { gameId: ' ' }, { gameId: null }, { gameId: 123 }
  ]) assert.equal(playerServer({ ...inGame, ...patch } as Presence), null, JSON.stringify(patch))
})

test('fresh presence must match the experience and server displayed before joining', () => {
  const expected = { placeId: inGame.placeId!, gameId: inGame.gameId! }
  assert.deepEqual(playerServer(inGame, expected), expected)
  assert.throws(() => playerServer({ ...inGame, placeId: 920587237 }, expected), /changed games or servers/)
  assert.throws(() => playerServer({ ...inGame, gameId: 'server-b' }, expected), /changed games or servers/)
  assert.equal(playerServer({ ...inGame, type: 0 }, expected), null)
  assert.equal(playerServer({ ...inGame, gameId: undefined }, expected), null)
})
