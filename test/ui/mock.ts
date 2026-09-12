import type { Page } from '@playwright/test'

// The renderer uses the real components with an isolated IPC boundary. No cookies,
// filesystem changes, Roblox launches, or external requests are needed by this suite.
export async function mockApp(page: Page, options: { empty?: boolean; locked?: boolean; failStartup?: boolean } = {}) {
  await page.addInitScript((options) => {
    const accounts = ['Orbit', 'Nova', 'Echo', 'Atlas'].map((username, i) => ({
      userId: i + 1, username, displayName: username, alias: '', group: i < 2 ? 'Main' : 'Alts',
      note: '', avatarUrl: '', presence: { type: i === 1 ? 2 : 0, lastLocation: i === 1 ? 'Blox Fruits' : '', gameId: i === 1 ? 'server-a' : undefined },
      addedAt: '2026-01-01T00:00:00Z', cookieExpired: i === 2, order: i, pinned: i === 0
    }))
    const data = {
      accounts: options.empty ? [] : accounts,
      groups: options.empty ? [] : [{ name: 'Main', color: '#aa9cff', order: 0 }, { name: 'Alts', color: '#71b6f4', order: 1 }],
      presets: options.empty ? [] : [{ id: 'f1', name: 'Blox Fruits', placeId: 2753915549, jobId: 'saved-job', universeId: 994732206 }],
      servers: options.empty ? [] : [{ id: 'p1', name: 'Friends only', placeId: 2753915549, linkCode: 'test-code', accessCode: 'test-access' }],
      withCookie: options.empty ? [] : [1, 2, 3]
    }
    let settings = {
      theme: 'dark', sortMode: 'custom', multiInstance: true, launchDelayMs: 3000, lastPlaceId: 0,
      anonymize: false, hideCookieActions: true, autoLockMinutes: 0, openAtLogin: false,
      flagPresets: [], flagCustom: {}, autoUpdate: true, isolateProfiles: true, autoTile: false,
      autoRefreshCookies: true, privacyMode: false, killTrayProcesses: false, syncAuto: true, syncIntervalMin: 15
    }
    const events = new Map<string, Set<(payload: any) => void>>()
    const calls: { channel: string; args: any[] }[] = []
    const failures: Record<string, string> = {}
    const delays: Record<string, number> = {}
    const playerPresence: Record<string, any> = {
      default: { presence: { type: 2, placeId: 2753915549, gameId: 'player-server-a', lastLocation: 'Blox Fruits', universeId: 994732206 } }
    }
    const emit = (channel: string, payload: any) => events.get(channel)?.forEach(fn => fn(structuredClone(payload)))
    let locked = options.locked ?? false
    Object.assign(window, {
      __mock: { data, calls, failures, delays, emit, options, playerPresence },
      api: {
        on(channel: string, fn: (payload: any) => void) {
          if (!events.has(channel)) events.set(channel, new Set())
          events.get(channel)!.add(fn)
          return () => events.get(channel)!.delete(fn)
        },
        async call(channel: string, ...args: any[]) {
          calls.push({ channel, args: structuredClone(args) })
          const activity = channel === 'player:presence'
            ? (args[0].length ? args[0] : [null]).map((userId: number | null) => ({ userId, ...structuredClone(playerPresence[String(userId)] ?? playerPresence.default) }))
            : undefined
          if (delays[channel]) await new Promise(resolve => setTimeout(resolve, delays[channel]))
          if (failures[channel]) throw new Error(failures[channel])
          switch (channel) {
            case 'vault:status':
              if (options.failStartup) throw new Error('Could not read vault. Try again.')
              return { initialized: true, locked, mode: 'password' }
            case 'settings:get': return structuredClone(settings)
            case 'settings:set': settings = { ...settings, ...args[0] }; return structuredClone(settings)
            case 'data:all': return structuredClone(data)
            case 'app:info': return { version: '1.5.0', platform: 'darwin', packaged: false, dataDir: '/test/TrapRAM' }
            case 'update:state': return { status: 'idle' }
            case 'game:recent': return [{ placeId: 920587237, universeId: 383310974, name: 'Adopt Me!', creator: 'Uplift Games', playing: 12345 }]
            case 'game:ping': return { name: 'Blox Fruits', playing: 48210, universeId: 994732206 }
            case 'game:search': return [{ name: args[0], placeId: 2753915549, universeId: 994732206, creator: 'Gamer Robot', playing: 48210 }]
            case 'game:servers': return { list: [{ id: 'server-a', playing: 3, maxPlayers: 12, fps: 60, ping: 48 }, { id: 'server-full', playing: 12, maxPlayers: 12, fps: 59, ping: 80 }] }
            case 'player:lookup': return { userId: /^\d+$/.test(args[0]) ? Number(args[0]) : args[0] === 'FirstPlayer' ? 100 : 200, username: args[0], displayName: args[0] }
            case 'player:presence': return activity
            case 'player:status': return args[0].map((userId: number) => ({ userId, friendStatus: 'none', isFriend: false, isFollowing: false }))
            case 'player:friend': return []
            case 'player:follow': return []
            case 'launch:many': return []
            case 'launch:one': return true
            case 'launch:follow': return true
            case 'launch:player': return []
            case 'vault:lock': locked = true; emit('vault:locked', { initialized: true, locked, mode: 'password' }); return true
            case 'vault:unlock': locked = false; return structuredClone(data)
            case 'account:update': {
              const ids = Array.isArray(args[0]) ? args[0] : [args[0]]
              data.accounts = data.accounts.map(a => ids.includes(a.userId) ? { ...a, ...args[1] } : a)
              emit('data:changed', data); return true
            }
            case 'account:remove': data.accounts = data.accounts.filter(a => a.userId !== args[0]); emit('data:changed', data); return true
            case 'preset:save': data.presets = [args[0]]; emit('data:changed', data); return true
            case 'preset:remove': data.presets = []; emit('data:changed', data); return true
            case 'server:save': data.servers = [args[0]]; emit('data:changed', data); return true
            case 'server:remove': data.servers = []; emit('data:changed', data); return true
            case 'share:resolve': return { placeId: 2753915549, linkCode: 'test-code', accessCode: 'test-access' }
            case 'system:processes': return []
            case 'flags:read': return {}
            case 'flags:presets': return { clean: { label: 'Roblox defaults', hint: 'Use the standard client settings.', flags: {} } }
            case 'sync:state': return { configured: false, url: '', key: '', auto: true, intervalMin: 15, busy: false }
            case 'account:refresh': return true
            default: throw new Error(`Unmocked IPC: ${channel}`)
          }
        }
      }
    })
  }, options)
  await page.goto('/')
}
