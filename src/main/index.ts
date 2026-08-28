import { app, BrowserWindow, ipcMain, shell, dialog, clipboard, nativeTheme, screen } from 'electron'
import { join } from 'node:path'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type {
  Account,
  BulkImportResult,
  BulkLoginResult,
  LaunchTarget,
  PlayerRelationship,
  Preset,
  PrivateServer,
  Settings,
  SyncState
} from '@shared/types'
import { gate, grid, groupsOf, regionMismatch } from '@shared/pure'
import { Vault } from './vault'
import * as roblox from './roblox'
import * as region from './region'
import * as launcher from './launcher'
import * as system from './system'
import * as browser from './browser'
import * as profiles from './profiles'
import * as store from './settings'
import * as updater from './updater'
import * as sync from './sync'

const vault = new Vault()
let main: BrowserWindow | null = null
let presenceTimer: NodeJS.Timeout | null = null
let refreshTimer: NodeJS.Timeout | null = null
let syncTimer: NodeJS.Timeout | null = null
let trayTimer: NodeJS.Timeout | null = null
let syncDebounce: NodeJS.Timeout | null = null
let lastLaunchAt = 0
let polling = false

const launches = gate()

const primary = app.requestSingleInstanceLock()
if (!primary) app.quit()

app.on('second-instance', () => {
  if (main) {
    if (main.isMinimized()) main.restore()
    main.focus()
  }
})

const send = (channel: string, payload?: unknown): void => {
  if (main && !main.isDestroyed()) main.webContents.send(channel, payload)
}

function snapshot() {
  const d = vault.read()
  return {
    accounts: d.accounts,
    groups: groupsOf(d.accounts),
    presets: d.presets,
    servers: d.servers,
    withCookie: Object.keys(d.cookies).map(Number)
  }
}

const pushData = (): void => send('data:changed', snapshot())

function createWindow(): void {
  const w = store.windowState()
  main = new BrowserWindow({
    ...w,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0c10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay:
      process.platform === 'win32' ? { color: '#0b0c10', symbolColor: '#9aa0b4', height: 40 } : undefined,
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 18 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  main.once('ready-to-show', () => main?.show())
  main.on('close', () => {
    if (!main) return
    const b = main.getBounds()
    store.saveWindowState({ width: b.width, height: b.height, x: b.x, y: b.y })
  })
  main.webContents.setWindowOpenHandler(({ url }) => {
    browser.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) main.loadURL(`${process.env.ELECTRON_RENDERER_URL}/index.html`)
  else main.loadFile(join(__dirname, '../renderer/index.html'))

  updater.attach(main, store.get().autoUpdate)
}

async function refreshAccounts(userIds?: number[], reloadAvatars = false): Promise<void> {
  if (!vault.isUnlocked) return
  const d = vault.read()
  const targets = d.accounts.filter((a) => !userIds || userIds.includes(a.userId))
  if (!targets.length) return

  const anyCookie = Object.values(d.cookies)[0]
  const ids = targets.map((a) => a.userId)
  const wantPics = targets.filter((a) => reloadAvatars || !a.avatarUrl).map((a) => a.userId)

  const [pres, pics] = await Promise.all([
    anyCookie
      ? roblox.presences(anyCookie, ids).catch(() => ({}) as Awaited<ReturnType<typeof roblox.presences>>)
      : Promise.resolve({} as Awaited<ReturnType<typeof roblox.presences>>),
    wantPics.length
      ? roblox.avatars(wantPics).catch(() => ({}) as Awaited<ReturnType<typeof roblox.avatars>>)
      : Promise.resolve({} as Awaited<ReturnType<typeof roblox.avatars>>)
  ])

  if (!vault.isUnlocked) return
  let changed = false
  for (const a of vault.read().accounts) {
    const p = pres[a.userId]
    if (p && JSON.stringify(p) !== JSON.stringify(a.presence)) {
      a.presence = p
      changed = true
    }
    if (pics[a.userId] && pics[a.userId] !== a.avatarUrl) {
      a.avatarUrl = pics[a.userId]
      changed = true
    }
  }
  if (!changed) return
  await vault.save()
  pushData()
}

function pollPresence(): void {
  if (polling || !vault.isUnlocked) return
  polling = true
  void refreshAccounts()
    .catch(() => undefined)
    .finally(() => {
      polling = false
    })
}

async function revalidate(userId: number): Promise<Account | undefined> {
  const d = vault.read()
  const acc = d.accounts.find((a) => a.userId === userId)
  const cookie = d.cookies[String(userId)]
  if (!acc || !cookie) return acc
  try {
    const info = await roblox.validate(cookie)
    acc.username = info.username
    acc.displayName = info.displayName
    acc.cookieExpired = false
    acc.lastValidated = new Date().toISOString()
  } catch {
    acc.cookieExpired = true
  }
  if (!acc.region && !acc.cookieExpired) acc.region = await region.current()
  acc.moderation = await roblox.moderation(cookie, userId).catch(() => acc.moderation)
  await vault.save()
  return acc
}

async function stampRegions(): Promise<void> {
  if (!vault.isUnlocked) return
  if (!vault.read().accounts.some((a) => !a.region)) return
  const here = await region.current()
  if (!here || !vault.isUnlocked) return
  for (const a of vault.read().accounts) if (!a.region) a.region = here
  await vault.save()
}

async function refreshSessions(
  userIds?: number[]
): Promise<{ renewed: number; failed: number; skipped: number }> {
  const d = vault.read()
  const targets = d.accounts.filter((a) => (!userIds || userIds.includes(a.userId)) && d.cookies[String(a.userId)])
  const here = await region.current()
  let renewed = 0
  let failed = 0
  let skipped = 0

  for (const acc of targets) {
    if (regionMismatch(acc.region, here)) {
      skipped++
      continue
    }
    try {
      const next = await roblox.refreshCookie(d.cookies[String(acc.userId)])
      if (next) {
        d.cookies[String(acc.userId)] = next
        renewed++
      }
      acc.cookieExpired = false
      acc.lastValidated = new Date().toISOString()
      if (!acc.region) acc.region = here
    } catch {
      acc.cookieExpired = true
      failed++
    }
  }
  await vault.save()
  pushData()
  return { renewed, failed, skipped }
}

function startRefreshLoop(): void {
  if (refreshTimer) clearInterval(refreshTimer)
  if (!store.get().autoRefreshCookies) return
  setTimeout(() => {
    if (vault.isUnlocked) void refreshSessions().catch(() => undefined)
  }, 8000).unref()
  refreshTimer = setInterval(
    () => {
      if (vault.isUnlocked) void refreshSessions().catch(() => undefined)
    },
    12 * 60 * 60 * 1000
  )
  refreshTimer.unref()
}

function syncState(): SyncState {
  const s = store.get()
  const { configured, key } = sync.status(vault)
  const last = sync.lastRun()
  return {
    configured,
    key,
    url: s.syncUrl,
    auto: s.syncAuto,
    intervalMin: s.syncIntervalMin,
    busy: sync.isBusy(),
    lastAt: last.at,
    lastError: last.error,
    lastSummary: last.summary
  }
}

async function backgroundSync(): Promise<void> {
  if (!vault.isUnlocked || sync.isBusy() || !sync.status(vault).configured) return
  try {
    if ((await sync.run(vault)).pulled) pushData()
  } catch {}
  send('sync:state', syncState())
}

function scheduleSync(): void {
  if (!store.get().syncAuto) return
  if (syncDebounce) clearTimeout(syncDebounce)
  syncDebounce = setTimeout(() => void backgroundSync(), 6000)
  syncDebounce.unref()
}

function startSyncLoop(): void {
  if (syncTimer) clearInterval(syncTimer)
  syncTimer = null
  const s = store.get()
  if (!s.syncAuto || !s.syncUrl || s.syncIntervalMin <= 0) return

  syncTimer = setInterval(() => void backgroundSync(), Math.max(5, s.syncIntervalMin) * 60_000)
  syncTimer.unref()
}

function startTraySweep(): void {
  if (trayTimer) clearInterval(trayTimer)
  trayTimer = null
  if (!launcher.isWin || !store.get().killTrayProcesses) return
  trayTimer = setInterval(() => {
    void system.killBackground().catch(() => undefined)
  }, 60_000)
  trayTimer.unref()
}

function startPresenceLoop(): void {
  if (presenceTimer) clearInterval(presenceTimer)
  const secs = Math.max(20, store.get().presencePollSeconds)
  presenceTimer = setInterval(pollPresence, secs * 1000)
  presenceTimer.unref()
}

function validSession(username: string): Account | undefined {
  const d = vault.read()
  const acc = d.accounts.find((a) => a.username.toLowerCase() === username.toLowerCase())
  return acc && !acc.cookieExpired && d.cookies[String(acc.userId)] ? acc : undefined
}

async function addFromCookie(cookie: string, password?: string): Promise<Account> {
  const info = await roblox.validate(cookie)
  const home = await region.current()
  const d = vault.read()
  const existing = d.accounts.find((a) => a.userId === info.userId)
  d.cookies[String(info.userId)] = cookie

  if (existing) {
    existing.username = info.username
    existing.displayName = info.displayName
    existing.cookieExpired = false
    existing.lastValidated = new Date().toISOString()
    existing.region = home
    if (password) existing.password = password
    await vault.save()
    void refreshAccounts([info.userId]).catch(() => undefined)
    scheduleSync()
    return existing
  }

  const acc: Account = {
    userId: info.userId,
    username: info.username,
    displayName: info.displayName,
    alias: '',
    group: '',
    note: '',
    avatarUrl: '',
    presence: { type: 0, lastLocation: '' },
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastValidated: new Date().toISOString(),
    cookieExpired: false,
    order: d.accounts.length,
    pinned: false,
    region: home,
    password
  }
  d.accounts.push(acc)
  delete d.tombstones[String(info.userId)]
  await vault.save()
  void refreshAccounts([info.userId]).catch(() => undefined)
  scheduleSync()
  return acc
}

async function warnIfSingleInstance(launching: number): Promise<void> {
  if (store.get().multiInstance) return
  const running = (await system.processes().catch(() => [])).length
  if (!running && launching < 2) return
  send(
    'toast:warn',
    running
      ? 'Roblox is already running — this launch replaces it. Turn on "Allow multiple clients at once" in Settings.'
      : 'Multiple clients are off, so these accounts will replace each other. Turn it on in Settings.'
  )
}

async function throttle(): Promise<void> {
  const gap = store.get().launchDelayMs
  const wait = lastLaunchAt + gap - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastLaunchAt = Date.now()
}

async function enableMultiInstance(): Promise<void> {
  if (!launcher.isWin) return
  if (await system.killBackground().catch(() => 0)) await new Promise((r) => setTimeout(r, 600))
  await launcher.setMultiInstance(true)
}

async function runLaunch(userId: number, open: (settings: Settings) => Promise<void>): Promise<void> {
  return launches(async () => {
    const home = vault.read().accounts.find((a) => a.userId === userId)
    const here = await region.current()
    if (home && regionMismatch(home.region, here)) {
      throw new Error(
        `${home.alias || home.username} was added from ${home.region} and you are in ${here} — launching would sign it in from there. Turn the VPN off, or paste its cookie again from here.`
      )
    }

    const s = store.get()
    if (s.isolateProfiles) {
      const res = await profiles.activate(userId)
      if (!res.swapped && res.reason === 'client-running') {
        send('toast', 'Client profile left as-is — another Roblox client is already running')
      }
    }
    if (s.privacyMode) await launcher.clearTrackingCookies()

    if (s.multiInstance && launcher.isWin) {
      await enableMultiInstance().catch((e: Error) => send('toast:warn', e.message))
    }
    await throttle()
    let launchSettings = s
    if (launcher.isMac && s.multiInstance) {
      launchSettings = { ...s, multiInstance: (await system.processes()).length > 0 }
    }
    await open(launchSettings)
    const acc = vault.read().accounts.find((a) => a.userId === userId)
    if (acc) {
      acc.lastLaunch = new Date().toISOString()
      await vault.save()
    }
  })
}

async function launchOne(userId: number, target: LaunchTarget): Promise<void> {
  return runLaunch(userId, (s) => launcher.launch(vault.cookie(userId), target, s.multiInstance, userId))
}

type PlayerAction = 'friend' | 'follow'

async function actOnPlayer(
  userIds: number[],
  targetUserId: number,
  action: PlayerAction
): Promise<{ userId: number; error: string }[]> {
  const failed: { userId: number; error: string }[] = []
  for (const userId of userIds) {
    try {
      const cookie = vault.cookie(userId)
      if (action === 'friend') await roblox.sendFriendRequest(cookie, targetUserId)
      else await roblox.followPlayer(cookie, targetUserId)
    } catch (e) {
      failed.push({ userId, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return failed
}

async function playerRelationships(userIds: number[], targetUserId: number): Promise<PlayerRelationship[]> {
  return Promise.all(
    userIds.map(async (userId) => {
      try {
        return { userId, ...(await roblox.playerRelationship(vault.cookie(userId), userId, targetUserId)) }
      } catch (e) {
        return {
          userId,
          friendStatus: 'none',
          isFriend: false,
          isFollowing: false,
          error: e instanceof Error ? e.message : String(e)
        }
      }
    })
  )
}

async function launchIntoPlayer(
  userIds: number[],
  targetUserId: number
): Promise<{ userId: number; error: string }[]> {
  await warnIfSingleInstance(userIds.length)
  const failed: { userId: number; error: string }[] = []
  for (const userId of userIds) {
    try {
      const where = await roblox.friendServer(vault.cookie(userId), targetUserId)
      if (!where) throw new Error('That player is not in a joinable game right now')
      await launchOne(userId, { placeId: where.placeId, jobId: where.gameId })
    } catch (e) {
      failed.push({ userId, error: e instanceof Error ? e.message : String(e) })
    }
  }
  if (store.get().autoTile) {
    setTimeout(() => void system.tileWindows().catch(() => undefined), 12_000).unref()
  }
  return failed
}

async function launchBrowserGame(userId: number, uri: string): Promise<void> {
  await warnIfSingleInstance(1)

  if (/^roblox:\/\/navigation\/share_links(?:[/?]|$)/i.test(uri)) {
    const link = new URL(uri)
    const type = link.searchParams.get('type')
    const code = link.searchParams.get('code')?.trim()
    if (type && type.toLowerCase() !== 'server') throw new Error('TrapRAM can only join Server share links')
    if (!code) throw new Error('Roblox share link did not contain an invite code')

    const resolved = await roblox.resolveShareLink(vault.cookie(userId), code)
    return launchOne(userId, {
      placeId: resolved.placeId,
      linkCode: resolved.linkCode,
      accessCode: resolved.accessCode
    })
  }

  if (/^roblox:\/\/experiences\/start(?:[/?]|$)/i.test(uri)) {
    const link = new URL(uri)
    const placeId = Number(link.searchParams.get('placeId'))
    const jobId = link.searchParams.get('gameInstanceId') || link.searchParams.get('gameId') || undefined
    if (!Number.isSafeInteger(placeId) || placeId <= 0) throw new Error('Roblox deep link did not contain a valid Place ID')
    return launchOne(userId, { placeId, jobId })
  }

  return runLaunch(userId, (s) => launcher.launchUri(uri, s.multiInstance, userId))
}

function copyTemporarily(secret: string): boolean {
  clipboard.writeText(secret)
  setTimeout(() => {
    try {
      if (clipboard.readText() === secret) clipboard.clear()
    } catch {}
  }, 45_000).unref()
  return true
}

type Handler = (...args: never[]) => unknown

function handle(channel: string, fn: Handler, needsVault = true): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      if (needsVault) {
        if (!vault.isUnlocked) throw new Error('Vault is locked')

        vault.touch()
      }
      return { ok: true, value: await (fn as (...a: unknown[]) => unknown)(...args) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}

function registerIpc(): void {
  handle('vault:status', () => vault.status(), false)
  handle('vault:create', async (mode: 'keychain' | 'password', password?: string) => {
    await vault.create(mode, password)
    vault.setAutoLock(store.get().autoLockMinutes)
    return snapshot()
  }, false)
  handle('vault:unlock', async (password: string) => {
    await vault.unlock(password)
    vault.setAutoLock(store.get().autoLockMinutes)
    startPresenceLoop()
    startRefreshLoop()
    startSyncLoop()
    pollPresence()
    void stampRegions().catch(() => undefined)
    void backgroundSync()
    return snapshot()
  }, false)
  handle('vault:lock', () => {
    vault.lock()
    return true
  }, false)
  handle('vault:changePassword', async (cur: string, next: string) => {
    await vault.changePassword(cur, next)
    return vault.status()
  })
  handle('vault:useKeychain', async () => {
    await vault.switchToKeychain()
    return vault.status()
  })

  handle('data:all', () => snapshot())

  handle('account:addCookie', (cookie: string) => addFromCookie(cookie.trim()))
  handle('account:addLogin', async () => {
    const res = await browser.openLogin(main ?? undefined)
    if (!res) return null
    return addFromCookie(res.cookie, res.password)
  })
  handle('account:bulkImportCookies', async (cookies: string[]) => {
    const results: BulkImportResult[] = []
    for (const raw of cookies.slice(0, 50)) {
      const cookie = raw.trim()
      if (!cookie) continue
      try {
        const acc = await addFromCookie(cookie)
        results.push({ ok: true, username: acc.username, account: acc })
      } catch (e) {
        results.push({ ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    }
    pushData()
    return results
  })
  handle('account:remove', async (userId: number) => {
    await vault.mutate((d) => {
      d.accounts = d.accounts.filter((a) => a.userId !== userId)
      delete d.cookies[String(userId)]

      d.tombstones[String(userId)] = new Date().toISOString()
    })
    await profiles.forget(userId).catch(() => undefined)
    pushData()
    scheduleSync()
  })
  handle('account:refreshCookies', async (userIds?: number[]) => {
    const res = await refreshSessions(userIds)
    scheduleSync()
    return res
  })
  handle('account:update', async (userId: number | number[], patch: Partial<Account>) => {
    const ids = Array.isArray(userId) ? userId : [userId]
    const at = new Date().toISOString()
    await vault.mutate((d) => {
      for (const id of ids) {
        const a = d.accounts.find((x) => x.userId === id)
        if (!a) continue
        Object.assign(a, patch, { userId: a.userId, updatedAt: at })
        a.group = a.group.trim()
      }
    })
    pushData()
    scheduleSync()
  })
  handle('account:reorder', async (orderedIds: number[]) => {
    const at = new Date().toISOString()
    await vault.mutate((d) => {
      orderedIds.forEach((id, i) => {
        const a = d.accounts.find((x) => x.userId === id)
        if (a && a.order !== i) {
          a.order = i

          a.updatedAt = at
        }
      })
    })
    pushData()
    scheduleSync()
  })
  handle('account:refresh', async (userIds?: number[]) => {
    await refreshAccounts(userIds, true)
    return snapshot()
  })
  handle('account:revalidate', async (userIds: number[]) => {
    for (const id of userIds) await revalidate(id)
    pushData()
    scheduleSync()
    return snapshot()
  })
  handle('account:balance', (userId: number) => roblox.balance(vault.cookie(userId), userId))
  handle('account:copyCookie', (userId: number) => {
    if (store.get().hideCookieActions) throw new Error('Cookie actions are disabled in Settings')
    return copyTemporarily(vault.cookie(userId))
  })
  handle('account:copyPassword', (userId: number) => {
    const password = vault.read().accounts.find((a) => a.userId === userId)?.password
    if (!password) throw new Error('No password saved for this account — add one in Edit')
    return copyTemporarily(password)
  })
  handle('login:create', async () => {
    const c = await roblox.createLoginCode()
    return { ...c, qr: await roblox.loginQr(c.code, c.privateKey).catch(() => '') }
  })
  handle('login:poll', async (code: string, privateKey: string) => {
    const s = await roblox.loginStatus(code, privateKey)
    const seen = { status: s.status, accountName: s.accountName ?? null }
    if (s.status !== 'Validated') return { ...seen, account: null }
    const cookie = await roblox.redeemLoginCode(code, privateKey)
    return { ...seen, account: await addFromCookie(cookie) }
  })
  handle('login:bulkOpen', (creds: { username?: string; password?: string }[], injectJs?: string, concurrency?: number) => {
    const batch = creds
    const area = screen.getPrimaryDisplay().workArea
    const slots = Math.max(1, Math.min(concurrency ?? batch.length, batch.length))
    const cells = grid(slots, area.width, area.height, area.x, area.y)

    let next = 0
    const runSlot = async (slot: number): Promise<void> => {
      if (next >= batch.length) return
      const i = next++
      const cred = batch[i]

      const already = cred.username ? validSession(cred.username) : undefined
      if (already) {
        send('bulkLogin:result', {
          index: i,
          username: already.username,
          ok: true,
          skipped: true,
          account: already
        } as BulkLoginResult)
        return runSlot(slot)
      }

      const c = cells[slot]
      const bounds = { x: c.x, y: c.y, width: c.w, height: c.h }
      const prefill = cred.username && cred.password ? { username: cred.username, password: cred.password } : undefined
      const res = await browser.openLogin(main ?? undefined, prefill, bounds, injectJs).catch(() => null)
      if (!res) {
        send('bulkLogin:result', {
          index: i,
          username: cred.username,
          ok: false,
          error: 'Window closed before signing in'
        } as BulkLoginResult)
      } else {
        try {
          const acc = await addFromCookie(res.cookie, res.password || undefined)
          send('bulkLogin:result', {
            index: i,
            username: cred.username ?? acc.username,
            ok: true,
            account: acc
          } as BulkLoginResult)
        } catch (e) {
          send('bulkLogin:result', {
            index: i,
            username: cred.username,
            ok: false,
            error: e instanceof Error ? e.message : String(e)
          } as BulkLoginResult)
        }
      }
      return runSlot(slot)
    }

    for (let slot = 0; slot < slots; slot++) void runSlot(slot)
    return batch.length
  })
  handle('account:quickLoginCode', (userId: number, code: string) =>
    roblox.quickLoginCode(vault.cookie(userId), code)
  )
  handle('account:quickLoginConfirm', async (userId: number, code: string) => {
    await roblox.quickLoginConfirm(vault.cookie(userId), code)
    return true
  })
  handle('account:browse', async (userId: number, startUrl?: string) => {
    const d = vault.read()
    const acc = d.accounts.find((a) => a.userId === userId)
    return browser.openBrowseAs({
      userId,
      cookie: vault.cookie(userId),
      label: acc ? `${acc.alias || acc.username}` : `Account ${userId}`,
      extensionsDir: await browser.extensionsPath(store.get().extensionsDir),
      startUrl,
      onRobloxLaunch: (uri) => {
        void launchBrowserGame(userId, uri).catch((e) =>
          send('toast:warn', e instanceof Error ? e.message : String(e))
        )
      }
    })
  })

  handle('launch:one', async (userId: number, target: LaunchTarget) => {
    await warnIfSingleInstance(1)
    return launchOne(userId, target)
  })
  handle('launch:many', async (userIds: number[], target: LaunchTarget) => {
    await warnIfSingleInstance(userIds.length)
    const failed: { userId: number; error: string }[] = []
    for (const id of userIds) {
      try {
        await launchOne(id, target)
      } catch (e) {
        failed.push({ userId: id, error: e instanceof Error ? e.message : String(e) })
      }
    }
    if (store.get().autoTile) {
      setTimeout(() => void system.tileWindows().catch(() => undefined), 12_000).unref()
    }
    return failed
  })
  handle('launch:follow', async (userId: number, followUserId: number) => {
    const where = await roblox.friendServer(vault.cookie(userId), followUserId)
    if (!where) throw new Error('That account is not in a joinable game right now')
    await launchOne(userId, { placeId: where.placeId, jobId: where.gameId })
    return where
  })

  handle('player:lookup', (query: string) => roblox.lookupPlayer(query), false)
  handle('player:status', (userIds: number[], targetUserId: number) => playerRelationships(userIds, targetUserId))
  handle('player:friend', (userIds: number[], targetUserId: number) => actOnPlayer(userIds, targetUserId, 'friend'))
  handle('player:follow', (userIds: number[], targetUserId: number) => actOnPlayer(userIds, targetUserId, 'follow'))
  handle('launch:player', (userIds: number[], targetUserId: number) => launchIntoPlayer(userIds, targetUserId))
  handle('game:ping', (placeId: number) => launcher.ping(placeId))
  handle('game:recent', (userId: number) => roblox.recentGames(vault.cookie(userId)))
  handle('game:search', (query: string) => roblox.searchGames(query), false)
  handle('game:servers', (userId: number, placeId: number, cursor?: string) =>
    roblox.servers(vault.cookie(userId), placeId, cursor)
  )
  handle('share:resolve', (userId: number, code: string) => roblox.resolveShareLink(vault.cookie(userId), code))

  handle('preset:save', async (preset: Preset) => {
    await vault.mutate((d) => {
      const i = d.presets.findIndex((p) => p.id === preset.id)
      if (i >= 0) d.presets[i] = preset
      else d.presets.push({ ...preset, id: preset.id || randomUUID() })
    })
    pushData()
    scheduleSync()
  })
  handle('preset:remove', async (id: string) => {
    await vault.mutate((d) => {
      d.presets = d.presets.filter((p) => p.id !== id)
    })
    pushData()
    scheduleSync()
  })
  handle('server:save', async (server: PrivateServer) => {
    await vault.mutate((d) => {
      const i = d.servers.findIndex((s) => s.id === server.id)
      if (i >= 0) d.servers[i] = server
      else d.servers.push({ ...server, id: server.id || randomUUID() })
    })
    pushData()
    scheduleSync()
  })
  handle('server:remove', async (id: string) => {
    await vault.mutate((d) => {
      d.servers = d.servers.filter((s) => s.id !== id)
    })
    pushData()
    scheduleSync()
  })

  handle('settings:get', () => store.get(), false)
  handle('settings:set', async (patch: Partial<Settings>) => {
    const next = store.set(patch)
    if (patch.autoLockMinutes !== undefined) vault.setAutoLock(next.autoLockMinutes)
    if (patch.presencePollSeconds !== undefined) startPresenceLoop()
    if (patch.autoRefreshCookies !== undefined) startRefreshLoop()
    if (patch.syncAuto !== undefined || patch.syncIntervalMin !== undefined) startSyncLoop()
    if (patch.killTrayProcesses !== undefined) {
      startTraySweep()
      if (next.killTrayProcesses) void system.killBackground().catch(() => undefined)
    }
    if (patch.multiInstance !== undefined && launcher.isWin) {
      if (next.multiInstance) await enableMultiInstance()
      else await launcher.setMultiInstance(false)
    }
    if (patch.openAtLogin !== undefined) {
      app.setLoginItemSettings({ openAtLogin: next.openAtLogin })

      return store.set({ openAtLogin: app.getLoginItemSettings().openAtLogin })
    }
    if (patch.theme !== undefined) nativeTheme.themeSource = next.theme
    return next
  }, false)

  handle('system:processes', () => system.processes(), false)
  handle('system:kill', (pids: number[]) => system.kill(pids), false)
  handle('system:killAll', () => system.killAll(), false)
  handle('system:priority', (pids: number[], level: string) => system.setPriority(pids, level as 'normal'), false)
  handle('system:affinity', (pids: number[], cores: number) => system.setAffinity(pids, cores), false)
  handle('system:trim', (pids: number[]) => system.trimMemory(pids), false)
  handle('system:tile', () => system.tileWindows(), false)
  handle('system:killBackground', () => system.killBackground(), false)
  handle('system:accessibility', () => system.accessibilityGranted(), false)
  handle('system:requestAccessibility', () => system.requestAccessibility(), false)
  handle('system:openExternal', (url: string) => browser.openExternal(url), false)
  handle('system:openExtensions', async () => {
    const dir = await browser.extensionsPath(store.get().extensionsDir)
    await shell.openPath(dir)
    return dir
  }, false)

  handle('flags:read', async () => {
    const onDisk = await launcher.readFastFlags()
    const s = store.get()

    if (Object.keys(onDisk).length && !s.flagPresets.length && !Object.keys(s.flagCustom).length) {
      store.set({ flagCustom: onDisk })
    }
    return onDisk
  }, false)
  handle('flags:presets', () => launcher.FLAG_PRESETS, false)
  handle('flags:installed', () => launcher.isInstalled(), false)

  handle('flags:apply', async (presets: string[], custom?: Record<string, string | number | boolean>) => {
    const known = presets.filter((p) => p in launcher.FLAG_PRESETS)
    const overrides = custom ?? store.get().flagCustom
    const merged: Record<string, string | number | boolean> = {}
    for (const key of known) Object.assign(merged, launcher.FLAG_PRESETS[key].flags)
    Object.assign(merged, overrides)

    const installs = await launcher.writeFastFlags(merged)
    store.set({ flagPresets: known, flagCustom: overrides })
    return { installs, flags: merged }
  }, false)

  handle('backup:export', async (password: string) => {
    const blob = await vault.exportBackup(password)
    const res = await dialog.showSaveDialog(main!, {
      title: 'Export encrypted backup',
      defaultPath: `trapram-${new Date().toISOString().slice(0, 10)}.rvlt`,
      filters: [{ name: 'TrapRAM backup', extensions: ['rvlt'] }]
    })
    if (res.canceled || !res.filePath) return null
    await fs.writeFile(res.filePath, blob, { mode: 0o600 })
    return res.filePath
  })
  handle('backup:import', async (password: string, merge: boolean) => {
    const res = await dialog.showOpenDialog(main!, {
      title: 'Import encrypted backup',
      properties: ['openFile'],
      filters: [{ name: 'TrapRAM backup', extensions: ['rvlt'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    const added = await vault.importBackup(await fs.readFile(res.filePaths[0]), password, merge)
    pushData()
    return added
  })

  handle('sync:state', () => syncState())
  handle('sync:setup', async (url: string, key?: string) => {
    const clean = url.trim().replace(/\/+$/, '')
    if (!/^https:\/\/|^http:\/\/localhost(:\d+)?(\/|$)/.test(clean)) {
      throw new Error('The relay URL has to be https')
    }
    await sync.probe(clean)
    const secret = sync.normalizeKey(key?.trim() || sync.newKey())
    await vault.mutate((d) => {
      d.syncKey = secret
    })
    store.set({ syncUrl: clean })
    startSyncLoop()
    return syncState()
  })
  handle('sync:now', async () => {
    const res = await sync.run(vault)
    if (res.pulled) pushData()
    send('sync:state', syncState())
    return res
  })
  handle('sync:disable', async (wipeRelay: boolean) => {
    if (wipeRelay) await sync.wipe(vault).catch(() => undefined)
    await vault.mutate((d) => {
      delete d.syncKey
    })
    store.set({ syncUrl: '' })
    startSyncLoop()
    return syncState()
  })

  handle('update:state', () => updater.currentUpdate(), false)
  handle('update:check', () => updater.check(), false)
  handle('update:download', () => updater.download(), false)
  handle('update:install', () => updater.install(), false)

  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged,
    dataDir: app.getPath('userData')
  }), false)

  ipcMain.on('browser:cmd', (_e, payload: { userId: number; action: string; arg?: string }) => {
    browser.browserCommand(payload.userId, payload.action, payload.arg)
  })
}

vault.onLock = () => {
  send('vault:locked', vault.status())
  if (presenceTimer) clearInterval(presenceTimer)
  if (syncTimer) clearInterval(syncTimer)
  if (syncDebounce) clearTimeout(syncDebounce)
}

function survive(e: unknown): void {
  try {
    send('toast:warn', `Recovered from an internal error: ${e instanceof Error ? e.message : String(e)}`)
  } catch {}
}

process.on('uncaughtException', survive)
process.on('unhandledRejection', survive)

if (primary) void start()

async function start(): Promise<void> {
  await app.whenReady()
  app.setAppUserModelId('com.trapram.app')
  nativeTheme.themeSource = store.get().theme

  store.set({ openAtLogin: app.getLoginItemSettings().openAtLogin })
  registerIpc()
  await vault.init()
  vault.setAutoLock(store.get().autoLockMinutes)
  if (vault.isUnlocked) {
    startPresenceLoop()
    startRefreshLoop()
    startSyncLoop()
    pollPresence()
    void stampRegions().catch(() => undefined)
    void backgroundSync()
  }

  if (store.get().multiInstance) {
    void enableMultiInstance().catch((e: Error) => send('toast:warn', e.message))
  }
  startTraySweep()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault())
})
