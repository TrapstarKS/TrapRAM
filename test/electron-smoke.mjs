import { _electron as electron } from 'playwright'
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const directory = await mkdtemp(join(tmpdir(), 'trapram-smoke-'))
let app
try {
  await writeFile(join(directory, 'settings.json'), JSON.stringify({
    autoUpdate: false, autoRefreshCookies: false, killTrayProcesses: false, multiInstance: false, syncAuto: false,
    isolateProfiles: false, privacyMode: false, autoTile: false, launchDelayMs: 0
  }))
  const entry = join(directory, 'entry.cjs')
  const { version } = JSON.parse(await readFile('package.json', 'utf8'))
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'trapram-smoke', version, main: 'entry.cjs' }))
  await writeFile(entry, `const { app } = require('electron');
app.setPath('userData', ${JSON.stringify(directory)});
app.setName('TrapRAM smoke test');
require(${JSON.stringify(resolve('out/main/index.js'))});`)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  app = await electron.launch({ args: [directory], env })
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), directory)
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.getByRole('heading', { name: 'Set up your vault' }).waitFor()
  await page.getByRole('button', { name: /Master password/ }).click()
  await page.getByLabel('Master password', { exact: true }).fill('temporary-test-password')
  await page.getByLabel('Confirm', { exact: true }).fill('temporary-test-password')
  await page.getByRole('button', { name: 'Create vault', exact: true }).click()
  await page.getByRole('button', { name: 'Add your first account' }).waitFor()
  const mainWindow = await app.browserWindow(page)
  await mainWindow.evaluate(window => window.webContents.setZoomFactor(2))
  assert.equal(await page.evaluate(() => document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth + 1), false)
  await mainWindow.evaluate(window => window.webContents.setZoomFactor(1))
  await page.getByRole('button', { name: 'Add account', exact: true }).click()
  await page.getByRole('dialog', { name: 'Add an account', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  for (const section of ['Games', 'Servers', 'Private servers', 'Performance', 'Settings']) {
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: section, exact: true }).click()
    await page.getByRole('heading', { name: section, exact: true, level: 1 }).waitFor()
  }
  await page.getByRole('button', { name: 'Light', exact: true }).click()
  assert.equal(await page.evaluate(() => window.api.call('settings:get').then(s => s.theme)), 'light')
  await page.getByRole('navigation').getByRole('button', { name: 'Lock', exact: true }).click()
  await page.getByRole('heading', { name: 'Vault locked' }).waitFor()
  await page.getByLabel('Master password', { exact: true }).fill('temporary-test-password')
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await page.getByRole('button', { name: 'Add your first account' }).waitFor()

  // Exercise the real presence/launch IPC using synthetic sessions and a fully
  // intercepted network. Authentication tickets are always denied: no client opens.
  await app.evaluate(() => {
    const fixture = globalThis.__playerSmoke = { queue: [], tickets: 0, authenticated: [] }
    globalThis.fetch = async (url, init) => {
      if (url.includes('/v1/presence/users')) {
        const ids = JSON.parse(init.body).userIds
        const target = ids.includes(902)
        if (target) fixture.authenticated.push(!!init.headers.Cookie)
        const state = target ? fixture.queue.shift() : { userPresenceType: 0 }
        return Response.json({ userPresences: state ? ids.map(userId => ({ userId, ...state })) : [] })
      }
      if (url.includes('/v1/users/authenticated')) return Response.json({ id: 901, name: 'SmokeViewer', displayName: 'Smoke Viewer' })
      if (url.includes('cloudflare.com')) return new Response('loc=BR\n')
      if (url.includes('/v1/authentication-ticket')) fixture.tickets += 1
      return new Response('Blocked by isolated smoke test', { status: 403 })
    }
  })
  const queuePresence = values => app.evaluate((_, values) => { globalThis.__playerSmoke.queue = values }, values)
  const checkPresence = ids => page.evaluate(ids => window.api.call('player:presence', ids, 902), ids)
  const server = { placeId: 2753915549, gameId: 'smoke-server-a' }
  const playing = { userPresenceType: 2, ...server, lastLocation: 'Blox Fruits' }
  await queuePresence([playing])
  const publicRows = await checkPresence([])
  assert.equal(publicRows[0].userId, null)
  assert.equal(publicRows[0].presence.lastLocation, 'Blox Fruits')
  await page.evaluate(() => window.api.call('account:addCookie', 'synthetic-smoke-session'))

  const webContentsBeforeBrowse = await app.evaluate(({ webContents }) => webContents.getAllWebContents().length)
  await page.evaluate(() => window.api.call('account:browse', 901, 'data:text/html,<title>TrapRAM smoke browser</title>'))
  const webContentsWithBrowse = await app.evaluate(({ webContents }) => webContents.getAllWebContents().length)
  assert.ok(webContentsWithBrowse >= webContentsBeforeBrowse + 2, 'browser view must create content and toolbar webContents')
  await app.evaluate(({ BaseWindow, BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows()[0]
    const browser = BaseWindow.getAllWindows().find(window => window !== main)
    if (!browser) throw new Error('Could not find the smoke browser window')
    browser.destroy()
  })
  let webContentsAfterBrowse = webContentsWithBrowse
  for (let attempt = 0; attempt < 20 && webContentsAfterBrowse > webContentsBeforeBrowse; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 25))
    webContentsAfterBrowse = await app.evaluate(({ webContents }) => webContents.getAllWebContents().length)
  }
  assert.equal(webContentsAfterBrowse, webContentsBeforeBrowse, 'closing a browser window must destroy both webContents')

  await queuePresence([playing])
  const rows = await checkPresence([901, 999])
  assert.equal(rows[0].presence.type, 2)
  assert.ok(rows[1].error)
  assert.deepEqual(await app.evaluate(() => globalThis.__playerSmoke.authenticated), [false, true])
  for (const state of [null, { userPresenceType: 4 }, {}]) {
    await queuePresence([state])
    assert.ok((await checkPresence([901]))[0].error, 'Unknown activity must not be reported as offline')
  }
  const tryJoin = () => page.evaluate(server => window.api.call('launch:player', [901], 902, server), server)
  for (const state of [{ ...playing, placeId: 920587237 }, { ...playing, gameId: 'smoke-server-b' }, { userPresenceType: 0 }]) {
    await queuePresence([state])
    assert.equal((await tryJoin()).length, 1)
    assert.equal(await app.evaluate(() => globalThis.__playerSmoke.tickets), 0)
  }
  await queuePresence([playing, { ...playing, gameId: 'smoke-server-b' }])
  assert.match((await tryJoin())[0].error, /changed games or servers/)
  assert.equal(await app.evaluate(() => globalThis.__playerSmoke.tickets), 0, 'Recheck must stop a player who moves while queued')
  await queuePresence([playing, playing])
  assert.match((await tryJoin())[0].error, /launch ticket/)
  assert.equal(await app.evaluate(() => globalThis.__playerSmoke.tickets), 1, 'Matching fresh presence reaches launch authorization')
  await page.evaluate(() => window.api.call('account:remove', 901))

  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/electron-smoke.png', animations: 'disabled' })
  assert.deepEqual(errors, [])
  console.log('Electron smoke passed: isolated vault, sections, modal, zoom, theme, lock/unlock, browser cleanup, presence IPC, per-viewer errors, and game/server rechecks. No Roblox client launched.')
} finally {
  if (app) await app.close()
  await rm(directory, { recursive: true, force: true })
}
