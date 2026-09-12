import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePlaceId } from '../src/shared/plain.ts'

test('experience input accepts IDs and Roblox links without concatenating other digits', () => {
  for (const value of ['2753915549', ' 2753915549 ', 'https://www.roblox.com/games/2753915549/Blox-Fruits?foo=123', 'https://roblox.com/games/2753915549']) {
    assert.equal(parsePlaceId(value), 2753915549)
  }
  for (const value of ['', '0', '-10', '1.2', '12oops34', 'Infinity', '9007199254740992', 'https://example.com/games/123', 'https://www.roblox.com.evil.test/games/123', 'https://www.roblox.com/users/123']) {
    assert.equal(parsePlaceId(value), null, value)
  }
})
