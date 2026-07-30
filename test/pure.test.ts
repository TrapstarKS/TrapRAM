import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { seal, open, buildUri, grid, sanitizeAppStorage, parseEtime, mergeVault, fingerprint, shareable, newSyncKey, normalizeSyncKey, formatSyncKey, deriveSync } from '../src/shared/pure.ts'
import type { Account, SyncPayload } from '../src/shared/types.ts'

const NOW = Date.parse('2026-07-30T12:00:00Z')
const ago = (mins: number) => new Date(NOW - mins * 60_000).toISOString()

function account(userId: number, over: Partial<Account> = {}): Account {
  return {
    userId,
    username: `user${userId}`,
    displayName: `user${userId}`,
    alias: '',
    group: '',
    note: '',
    avatarUrl: '',
    presence: { type: 0, lastLocation: '' },
    addedAt: ago(600),
    cookieExpired: false,
    order: 0,
    pinned: false,
    ...over
  }
}

function payload(over: Partial<SyncPayload> = {}): SyncPayload {
  return { accounts: [], cookies: {}, groups: [], presets: [], servers: [], tombstones: {}, ...over }
}

test('a working session beats a dead one no matter which side edited last', () => {
  const local = payload({
    accounts: [account(1, { cookieExpired: true, lastValidated: ago(5), updatedAt: ago(1), alias: 'main' })],
    cookies: { '1': 'dead-cookie' }
  })
  const remote = payload({
    accounts: [account(1, { cookieExpired: false, lastValidated: ago(90) })],
    cookies: { '1': 'live-cookie' }
  })

  const { merged, stats } = mergeVault(local, remote, NOW)
  assert.equal(merged.cookies['1'], 'live-cookie')
  assert.equal(stats.cookies, 1)

  assert.equal(merged.accounts[0].alias, 'main')
  assert.equal(merged.accounts[0].cookieExpired, false)
  assert.equal(merged.accounts[0].lastValidated, ago(90))
})

test('a healthy local session is never replaced by a stale remote one', () => {
  const local = payload({
    accounts: [account(1, { lastValidated: ago(2) })],
    cookies: { '1': 'local-live' }
  })
  const remote = payload({
    accounts: [account(1, { lastValidated: ago(400) })],
    cookies: { '1': 'remote-older' }
  })
  const { merged, stats } = mergeVault(local, remote, NOW)
  assert.equal(merged.cookies['1'], 'local-live')
  assert.equal(stats.cookies, 0)
})

test('accounts only on one side come across, and the newer edit wins', () => {
  const local = payload({
    accounts: [account(1, { alias: 'old', updatedAt: ago(120) })],
    cookies: { '1': 'a' }
  })
  const remote = payload({
    accounts: [account(1, { alias: 'renamed', updatedAt: ago(3) }), account(2)],
    cookies: { '1': 'a', '2': 'b' }
  })

  const { merged, stats } = mergeVault(local, remote, NOW)
  assert.equal(merged.accounts.length, 2)
  assert.equal(merged.accounts.find((a) => a.userId === 1)?.alias, 'renamed')
  assert.equal(merged.cookies['2'], 'b')
  assert.deepEqual({ added: stats.added, updated: stats.updated }, { added: 1, updated: 1 })
})

test('a removed account does not come back from the other device', () => {
  const local = payload({ tombstones: { '7': ago(10) } })
  const remote = payload({ accounts: [account(7, { updatedAt: ago(60) })], cookies: { '7': 'c' } })

  const { merged } = mergeVault(local, remote, NOW)
  assert.equal(merged.accounts.length, 0)
  assert.equal(merged.cookies['7'], undefined)
  assert.ok(merged.tombstones['7'])
})

test('re-adding an account after a delete beats the tombstone', () => {
  const local = payload({ tombstones: { '7': ago(60) } })
  const remote = payload({ accounts: [account(7, { addedAt: ago(2) })], cookies: { '7': 'fresh' } })

  const { merged } = mergeVault(local, remote, NOW)
  assert.equal(merged.accounts.length, 1)
  assert.equal(merged.cookies['7'], 'fresh')
})

test('tombstones older than two months stop being carried around', () => {
  const local = payload({ tombstones: { '7': new Date(NOW - 61 * 86400_000).toISOString() } })
  const { merged } = mergeVault(local, payload(), NOW)
  assert.deepEqual(merged.tombstones, {})
})

test('two devices holding the same vault agree on its fingerprint', () => {
  const a = payload({
    accounts: [account(1, { order: 0 }), account(2, { order: 1 })],
    cookies: { '1': 'x', '2': 'y' },
    presets: [{ id: 'p1', name: 'Bedwars', placeId: 1 }]
  })
  const b = payload({
    accounts: [account(2, { order: 1 }), account(1, { order: 0 })],
    cookies: { '2': 'y', '1': 'x' },
    presets: [{ id: 'p1', name: 'Bedwars', placeId: 1 }]
  })
  assert.equal(fingerprint(a), fingerprint(b))

  const merged = mergeVault(a, b, NOW).merged
  assert.equal(fingerprint(merged), fingerprint(a))
})

test('both devices settle on one order instead of trading writes', () => {
  const reordered = payload({
    accounts: [account(1, { order: 1, updatedAt: ago(1) }), account(2, { order: 0, updatedAt: ago(1) })],
    cookies: { '1': 'x', '2': 'y' }
  })
  const stale = payload({
    accounts: [account(1, { order: 0 }), account(2, { order: 1 })],
    cookies: { '1': 'x', '2': 'y' }
  })

  const here = mergeVault(stale, reordered, NOW).merged
  const there = mergeVault(reordered, stale, NOW).merged
  assert.equal(fingerprint(here), fingerprint(there))
  assert.deepEqual(
    here.accounts.map((a) => a.userId),
    [2, 1]
  )
  assert.equal(fingerprint(mergeVault(here, there, NOW).merged), fingerprint(here))
})

test('polled data never reaches the relay', () => {
  const busy = account(1, {
    presence: { type: 2, placeId: 606849621, lastLocation: 'Jailbreak' },
    avatarUrl: 'https://tr.rbxcdn.com/abc',
    lastLaunch: ago(4)
  })
  const idle = account(1)

  assert.equal(
    fingerprint(payload({ accounts: [shareable(busy)] })),
    fingerprint(payload({ accounts: [shareable(idle)] }))
  )
  assert.equal(shareable(busy).lastLaunch, undefined)
})

test('a sync key survives being typed by hand', () => {
  const key = newSyncKey()
  assert.equal(key.length, 25)
  assert.equal(formatSyncKey(key), key.match(/.{5}/g)!.join('-'))

  assert.equal(normalizeSyncKey(formatSyncKey(key).toLowerCase()), key)
  assert.equal(normalizeSyncKey('ILOU' + key.slice(4)), '110V' + key.slice(4))
  assert.throws(() => normalizeSyncKey(key.slice(1)))
  assert.throws(() => normalizeSyncKey(''))
})

test('the relay learns nothing from a room id', () => {
  const a = deriveSync(newSyncKey())
  const b = deriveSync(newSyncKey())
  assert.match(a.room, /^[a-f0-9]{32}$/)
  assert.notEqual(a.room, b.room)
  assert.equal(a.enc.length, 32)

  assert.notEqual(a.enc.toString('hex'), a.room)
  assert.ok(!a.enc.toString('hex').includes(a.room))

  const key = newSyncKey()
  assert.equal(deriveSync(key).room, deriveSync(key).room)
  assert.deepEqual(deriveSync(key).enc, deriveSync(key).enc)
})

test('a blob sealed on one device opens on the other and nowhere else', () => {
  const key = newSyncKey()
  const body = Buffer.from(JSON.stringify({ cookies: { '1': 'secret' } }))
  const wire = seal(deriveSync(key).enc, body).toString('base64')

  assert.doesNotMatch(wire, /secret/)
  assert.equal(open(deriveSync(key).enc, Buffer.from(wire, 'base64')).toString(), body.toString())
  assert.throws(() => open(deriveSync(newSyncKey()).enc, Buffer.from(wire, 'base64')))
})

test('groups, presets and servers union instead of overwriting', () => {
  const local = payload({
    groups: [{ name: 'main', color: '#f00', order: 0 }],
    servers: [{ id: 's1', name: 'mine', placeId: 1, linkCode: 'l', accessCode: 'a' }]
  })
  const remote = payload({
    groups: [{ name: 'alts', color: '#0f0', order: 1 }],
    presets: [{ id: 'p9', name: 'Jailbreak', placeId: 606849621 }]
  })

  const { merged } = mergeVault(local, remote, NOW)
  assert.deepEqual(merged.groups.map((g) => g.name).sort(), ['alts', 'main'])
  assert.equal(merged.presets.length, 1)
  assert.equal(merged.servers.length, 1)
})

test('ps elapsed time parses in all three BSD shapes', () => {
  assert.equal(parseEtime('00:42'), 42)
  assert.equal(parseEtime('12:34'), 754)
  assert.equal(parseEtime('01:02:03'), 3723)
  assert.equal(parseEtime('2-03:04:05'), 2 * 86400 + 3 * 3600 + 4 * 60 + 5)
  assert.equal(parseEtime('garbage'), 0)
})

test('cpu time keeps its fraction, comma decimals and all', () => {
  assert.equal(parseEtime('0:03.45'), 3.45)
  assert.equal(parseEtime('12:34.56'), 754.56)
  assert.equal(parseEtime('0:03,45'), 3.45)
  assert.equal(parseEtime('1:02:03.5'), 3723.5)
})

let counter = 0
const stubId = () => `id-${++counter}`

test('sanitizer drops every cross-account link from appStorage', () => {
  const live = {
    Username: 'pedro_123126',
    UserId: '2885348060',
    CredentialValue: 'pedro_123126',
    DisplayName: 'pedro_123126',
    AccountBlob: 'blob',
    PlayerHydrationBlob: '{"userId":"2885348060"}',
    LastSuccessfulSignInMethod: 'username',
    AppInstallationId: '7032420283003589381',
    BrowserTrackerId: '1759340963060001',
    DeviceLevelTheme: { '2885348060': 'dark', '1928053099': 'light', '43131098': 'dark' },
    NativeCloseLuaPromptDisplayCount: '{"u_10696283762":"1","u_2885348060":"1"}',
    RobloxLocaleId: 'pt_br',
    SelectedOutputDeviceName: 'Fones de Ouvido Externos',
    ConnectToVoice: true
  }

  const out = sanitizeAppStorage(live, stubId)
  const text = JSON.stringify(out)

  for (const gone of [
    'Username',
    'UserId',
    'CredentialValue',
    'DisplayName',
    'AccountBlob',
    'PlayerHydrationBlob',
    'LastSuccessfulSignInMethod',
    'DeviceLevelTheme',
    'NativeCloseLuaPromptDisplayCount'
  ]) {
    assert.ok(!(gone in out), `${gone} survived sanitizing`)
  }

  assert.doesNotMatch(text, /2885348060|1928053099|43131098|10696283762/, 'a user id leaked through')

  assert.notEqual(out.AppInstallationId, '7032420283003589381')
  assert.notEqual(out.BrowserTrackerId, '1759340963060001')
  assert.notEqual(out.AppInstallationId, out.BrowserTrackerId)

  assert.equal(out.RobloxLocaleId, 'pt_br')
  assert.equal(out.SelectedOutputDeviceName, 'Fones de Ouvido Externos')
  assert.equal(out.ConnectToVoice, true)
  assert.equal(out.IsFirstLaunchAfterInstall, false)
})

test('sanitizer mints identity for a storage file that has none', () => {
  const out = sanitizeAppStorage({}, stubId)
  assert.ok(out.AppInstallationId)
  assert.ok(out.BrowserTrackerId)
})

test('sanitizer keeps maps that are not keyed by user id', () => {
  const out = sanitizeAppStorage({ Keybinds: { jump: 'Space', crouch: 'C' } }, stubId)
  assert.deepEqual(out.Keybinds, { jump: 'Space', crouch: 'C' })
})

test('sanitizer leaves plain strings and arrays alone', () => {
  const out = sanitizeAppStorage({ Note: 'not json {', Recent: ['a', 'b'] }, stubId)
  assert.equal(out.Note, 'not json {')
  assert.deepEqual(out.Recent, ['a', 'b'])
})

test('sealed data round-trips and rejects a wrong key', () => {
  const key = randomBytes(32)
  const plain = Buffer.from(JSON.stringify({ cookie: 'secret-value' }))
  const blob = seal(key, plain)

  assert.notEqual(blob.toString('utf8'), plain.toString('utf8'))
  assert.equal(open(key, blob).toString('utf8'), plain.toString('utf8'))
  assert.throws(() => open(randomBytes(32), blob))

  const tampered = Buffer.from(blob)
  tampered[tampered.length - 1] ^= 0xff
  assert.throws(() => open(key, tampered))
})

test('two seals of the same plaintext differ', () => {
  const key = randomBytes(32)
  const plain = Buffer.from('same input')
  assert.notEqual(seal(key, plain).toString('base64'), seal(key, plain).toString('base64'))
})

test('public launch URI carries place and ticket, no private fields', () => {
  const uri = buildUri('TICKET', { placeId: 123 }, 42, 1700000000000)
  assert.match(uri, /^roblox-player:1\+launchmode:play\+gameinfo:TICKET\+/)
  assert.match(uri, /placeId%3D123/)
  assert.match(uri, /request%3DRequestGame/)
  assert.doesNotMatch(uri, /linkCode/)
})

test('private server URI switches request type and carries both codes', () => {
  const uri = buildUri('T', { placeId: 9, linkCode: 'LINK', accessCode: 'ACCESS' }, 1, 0)
  assert.match(uri, /request%3DRequestPrivateGame/)
  assert.match(uri, /accessCode%3DACCESS/)
  assert.match(uri, /linkCode%3DLINK/)
})

test('link code doubles as access code when none was scraped', () => {
  const uri = buildUri('T', { placeId: 9, linkCode: 'LINK' }, 1, 0)
  assert.match(uri, /accessCode%3DLINK/)
})

test('job id only appears when joining a specific server', () => {
  assert.match(buildUri('T', { placeId: 9, jobId: 'JOB' }, 1, 0), /gameId%3DJOB/)
  assert.doesNotMatch(buildUri('T', { placeId: 9 }, 1, 0), /gameId/)
})

test('grid tiles every window inside the work area', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 9, 12]) {
    const cells = grid(n, 1920, 1080)
    assert.equal(cells.length, n, `expected ${n} cells`)
    for (const c of cells) {
      assert.ok(c.w > 0 && c.h > 0)
      assert.ok(c.x >= 0 && c.y >= 0, `cell starts off-screen at ${c.x},${c.y}`)
      assert.ok(c.x + c.w <= 1920, `cell overflows right edge: ${c.x + c.w}`)
      assert.ok(c.y + c.h <= 1080, `cell overflows bottom edge: ${c.y + c.h}`)
    }
  }
})

test('grid centres a short last row', () => {
  const cells = grid(3, 1200, 800)
  assert.equal(cells[0].y, cells[1].y)
  assert.notEqual(cells[2].y, cells[0].y)
  const lastCentre = cells[2].x + cells[2].w / 2
  assert.equal(lastCentre, 600)
})

test('grid honours the work-area origin', () => {
  const [cell] = grid(1, 1000, 600, 40, 25)
  assert.deepEqual(cell, { x: 40, y: 25, w: 1000, h: 600 })
})
