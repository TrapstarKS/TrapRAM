import { BaseWindow, BrowserWindow, WebContentsView, session, shell, app, Menu } from 'electron'
import type { Session } from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import fs from 'node:fs/promises'

const LOGIN_URL = 'https://www.roblox.com'
const SIGNIN_URL = 'https://www.roblox.com/login'
const HOME_URL = 'https://www.roblox.com/home'
const TOOLBAR_H = 46

const ALLOWED = [
  'roblox.com',
  'rbxcdn.com',
  'roblox.qq.com',
  'arkoselabs.com',
  'funcaptcha.com',
  'hcaptcha.com',
  'google.com',
  'gstatic.com',
  'apple.com',
  'facebook.com'
]

function hostAllowed(url: string): boolean {
  try {
    const h = new URL(url).hostname
    return ALLOWED.some((d) => h === d || h.endsWith(`.${d}`))
  } catch {
    return false
  }
}

function isRobloxLaunch(url: string): boolean {
  return /^roblox-player:/i.test(url)
}

export function openExternal(url: string): void {
  if (!/^https?:\/\//i.test(url) && !isRobloxLaunch(url)) return
  void shell.openExternal(url).catch(() => undefined)
}

function harden(ses: Session): void {
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'clipboard-sanitized-write' || permission === 'fullscreen')
  })
  ses.setPermissionCheckHandler(() => false)
  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const headers = { ...details.requestHeaders }
    delete headers['X-Requested-With']
    cb({ requestHeaders: headers })
  })
}

function guardNavigation(view: { webContents: Electron.WebContents }, onRobloxLaunch?: (url: string) => void): void {
  const open = (url: string): void => {
    if (isRobloxLaunch(url) && onRobloxLaunch) {
      onRobloxLaunch(url)
      return
    }
    openExternal(url)
  }
  const block = (e: Electron.Event, url: string): void => {
    if (hostAllowed(url)) return
    e.preventDefault()
    open(url)
  }
  view.webContents.on('will-frame-navigate', (details) => block(details, details.url))
  view.webContents.on('will-redirect', block)
  view.webContents.on('did-create-window', (window) => guardNavigation(window, onRobloxLaunch))
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || hostAllowed(url)) return { action: 'allow' }
    open(url)
    return { action: 'deny' }
  })
}

const LOGIN_POSTS = ['https://auth.roblox.com/v2/login', 'https://auth.roblox.com/v2/signup']

function fillScript(username: string, password: string): string {
  return `(() => {
    function set(obj, cb) {
      if (!obj) return
      cb(obj)
      for (const [k, v] of Object.entries(obj)) {
        if (k.includes('reactProps') && v && v.onChange) {
          v.onChange({ target: obj, nativeEvent: { inputType: 'insertText' } })
        }
      }
    }

    let tries = 0
    function tick() {
      const user = document.querySelector('#login-username, input[name="username"]')
      const pass = document.querySelector('#login-password, input[name="password"]')
      if (user && pass) {
        set(user, (o) => { o.value = ${JSON.stringify(username)} })
        set(pass, (o) => { o.value = ${JSON.stringify(password)} })
        console.log('[TrapRAM] filled username + password')
        setTimeout(submit, 300)
        return
      }
      if (++tries < 150) setTimeout(tick, 200)
      else console.log('[TrapRAM] ABORT: fields never appeared')
    }

    let subTries = 0
    function submit() {
      const btn = document.getElementById('login-button')
      if (!btn || btn.disabled) {
        if (++subTries < 30) return setTimeout(submit, 1000)
        console.log('[TrapRAM] ABORT: login button never became enabled')
        return
      }
      console.log('[TrapRAM] clicking login button')
      btn.click()
    }

    tick()
  })()`
}

export async function openLogin(
  parent?: BrowserWindow,
  prefill?: { username: string; password: string },
  bounds?: { x: number; y: number; width?: number; height?: number },
  injectJs?: string
): Promise<{ cookie: string; password: string } | null> {
  const partition = `trapram-login-${randomUUID()}`
  const ses = session.fromPartition(partition)
  harden(ses)
  await ses.clearStorageData()

  let password = prefill?.password ?? ''
  ses.webRequest.onBeforeRequest({ urls: LOGIN_POSTS }, (details, cb) => {
    const raw = details.uploadData?.map((d) => d.bytes?.toString('utf8') ?? '').join('')
    if (raw) {
      try {
        const typed = (JSON.parse(raw) as { password?: unknown }).password
        if (typeof typed === 'string' && typed) password = typed
      } catch {}
    }
    cb({})
  })

  const win = new BrowserWindow({
    width: 520,
    height: 760,
    ...bounds,
    parent,
    modal: false,
    title: prefill ? `Sign in — ${prefill.username}` : 'Sign in to Roblox',
    backgroundColor: '#0c0d12',
    autoHideMenuBar: true,
    webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  })
  guardNavigation(win)

  if (prefill) {
    win.webContents.on('dom-ready', () => {
      void win.webContents.executeJavaScript(fillScript(prefill.username, prefill.password)).catch(() => undefined)
    })
  }

  if (injectJs) {
    win.webContents.on('dom-ready', () => {
      void win.webContents.executeJavaScript(injectJs).catch(() => undefined)
    })
  }

  return new Promise<{ cookie: string; password: string } | null>((resolve) => {
    let settled = false
    const finish = (cookie: string | null) => {
      if (settled) return
      settled = true
      ses.clearStorageData().catch(() => undefined)
      resolve(cookie ? { cookie, password } : null)
      if (!win.isDestroyed()) win.destroy()
    }

    const check = async () => {
      if (settled) return
      const cookies = await ses.cookies.get({ name: '.ROBLOSECURITY' }).catch(() => [])
      const value = cookies.find((c) => c.value && c.value.length > 200)?.value
      if (value) finish(value)
    }

    ses.cookies.on('changed', (_e, cookie, _cause, removed) => {
      if (!removed && cookie.name === '.ROBLOSECURITY') void check()
    })
    win.webContents.on('did-navigate', () => void check())
    win.on('closed', () => finish(null))
    void win.loadURL(prefill ? SIGNIN_URL : LOGIN_URL).catch(() => finish(null))
  })
}

interface BrowseWindow {
  win: BaseWindow
  content: WebContentsView
  toolbar: WebContentsView
}

const browseWindows = new Map<number, BrowseWindow>()

async function loadExtensions(ses: Session, dir: string): Promise<string[]> {
  if (!dir) return []
  const loaded: string[] = []
  let entries: string[] = []
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
  for (const name of entries) {
    const path = join(dir, name)
    try {
      await fs.access(join(path, 'manifest.json'))
      const ext = await ses.loadExtension(path, { allowFileAccess: false })
      loaded.push(ext.name)
    } catch {}
  }
  return loaded
}

function sendState(b: BrowseWindow): void {
  if (b.toolbar.webContents.isDestroyed()) return
  b.toolbar.webContents.send('browser:state', {
    url: b.content.webContents.getURL(),
    title: b.content.webContents.getTitle(),
    canGoBack: b.content.webContents.navigationHistory.canGoBack(),
    canGoForward: b.content.webContents.navigationHistory.canGoForward(),
    loading: b.content.webContents.isLoading()
  })
}

export async function openBrowseAs(opts: {
  userId: number
  cookie: string
  label: string
  extensionsDir: string
  startUrl?: string
  onRobloxLaunch?: (url: string) => void
}): Promise<string[]> {
  const existing = browseWindows.get(opts.userId)
  if (existing && !existing.win.isDestroyed()) {
    existing.win.focus()
    return []
  }

  const partition = `trapram-acct-${opts.userId}-${randomUUID()}`
  const ses = session.fromPartition(partition)
  harden(ses)

  const extensions = await loadExtensions(ses, opts.extensionsDir)

  await ses.cookies.set({
    url: 'https://www.roblox.com',
    name: '.ROBLOSECURITY',
    value: opts.cookie,
    domain: '.roblox.com',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
  })

  const win = new BaseWindow({
    width: 1180,
    height: 820,
    minWidth: 520,
    minHeight: 400,
    title: opts.label,
    backgroundColor: '#0c0d12',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 15 } : undefined
  })

  const toolbar = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/overlay.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  const content = new WebContentsView({
    webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true }
  })

  win.contentView.addChildView(content)
  win.contentView.addChildView(toolbar)

  const layout = () => {
    const { width, height } = win.getContentBounds()
    toolbar.setBounds({ x: 0, y: 0, width, height: TOOLBAR_H })
    content.setBounds({ x: 0, y: TOOLBAR_H, width, height: Math.max(0, height - TOOLBAR_H) })
  }
  layout()
  win.on('resize', layout)

  const record: BrowseWindow = { win, content, toolbar }
  browseWindows.set(opts.userId, record)
  win.on('closed', () => {
    browseWindows.delete(opts.userId)
    void ses.clearStorageData().catch(() => undefined)
  })

  guardNavigation(content, opts.onRobloxLaunch)
  const update = () => sendState(record)
  content.webContents.on('did-navigate', update)
  content.webContents.on('did-navigate-in-page', update)
  content.webContents.on('did-start-loading', update)
  content.webContents.on('did-stop-loading', update)
  content.webContents.on('page-title-updated', update)

  content.webContents.on('context-menu', (_e, params) => {
    Menu.buildFromTemplate([
      { label: 'Back', enabled: content.webContents.navigationHistory.canGoBack(), click: () => content.webContents.navigationHistory.goBack() },
      { label: 'Reload', click: () => content.webContents.reload() },
      { type: 'separator' },
      { label: 'Copy', role: 'copy', enabled: !!params.selectionText },
      { label: 'Paste', role: 'paste', enabled: params.isEditable },
      { type: 'separator' },
      { label: 'Inspect element', click: () => content.webContents.inspectElement(params.x, params.y) }
    ]).popup()
  })

  const query = new URLSearchParams({ label: opts.label, uid: String(opts.userId), ext: String(extensions.length) })
  const overlayUrl = process.env.ELECTRON_RENDERER_URL
    ? `${process.env.ELECTRON_RENDERER_URL}/overlay.html?${query}`
    : `file://${join(__dirname, '../renderer/overlay.html')}?${query}`
  await toolbar.webContents.loadURL(overlayUrl).catch(() => undefined)
  await content.webContents.loadURL(opts.startUrl ?? HOME_URL).catch(() => undefined)

  return extensions
}

export function browserCommand(userId: number, action: string, arg?: string): void {
  const b = browseWindows.get(userId)
  if (!b || b.win.isDestroyed()) return
  const wc = b.content.webContents
  switch (action) {
    case 'back':
      wc.navigationHistory.goBack()
      break
    case 'forward':
      wc.navigationHistory.goForward()
      break
    case 'reload':
      wc.isLoading() ? wc.stop() : wc.reload()
      break
    case 'home':
      void wc.loadURL(HOME_URL).catch(() => undefined)
      break
    case 'go': {
      if (!arg) break
      const url = /^https?:\/\//i.test(arg) ? arg : `https://${arg}`
      if (hostAllowed(url)) void wc.loadURL(url).catch(() => undefined)
      else openExternal(url)
      break
    }
    case 'devtools':
      wc.toggleDevTools()
      break
    case 'external':
      openExternal(wc.getURL())
      break
  }
}

export async function extensionsPath(custom: string): Promise<string> {
  if (custom) return custom
  const dir = join(app.getPath('userData'), 'extensions')
  await fs.mkdir(dir, { recursive: true })
  return dir
}
