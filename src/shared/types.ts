export type PresenceType = 0 | 1 | 2 | 3

export interface Presence {
  type: PresenceType
  placeId?: number
  gameId?: string
  lastLocation: string
  universeId?: number
}

export interface Moderation {
  banned: boolean
  reason?: string
  expiresAt?: string
  checkedAt: string
}

export interface Account {
  userId: number
  username: string
  displayName: string
  alias: string
  group: string
  note: string
  avatarUrl: string
  presence: Presence
  addedAt: string

  updatedAt?: string
  lastValidated?: string
  lastLaunch?: string
  cookieExpired: boolean
  moderation?: Moderation
  order: number
  pinned: boolean

  region?: string
  password?: string
}

export interface GroupMeta {
  name: string
  color: string
  order: number
}

export interface Preset {
  id: string
  name: string
  placeId: number
  jobId?: string
  universeId?: number
  iconUrl?: string
  gameName?: string
}

export interface RecentGame {
  universeId: number
  placeId: number
  name: string
  creator: string
  playing: number
  iconUrl?: string
  lastPlayedAt?: string
}

export interface PlayerProfile {
  userId: number
  username: string
  displayName: string
  avatarUrl?: string
}

export type PlayerFriendStatus = 'friend' | 'pending' | 'incoming' | 'none'

export interface PlayerRelationship {
  userId: number
  friendStatus: PlayerFriendStatus
  isFriend: boolean
  isFollowing: boolean
  error?: string
}

export interface PrivateServer {
  id: string
  name: string
  placeId: number
  universeId?: number
  linkCode: string
  accessCode: string
  gameName?: string
  iconUrl?: string
}

export interface Settings {
  theme: 'dark' | 'light' | 'system'
  accent: string
  multiInstance: boolean
  killTrayProcesses: boolean
  launchDelayMs: number
  privacyMode: boolean
  isolateProfiles: boolean
  autoRefreshCookies: boolean
  autoTile: boolean
  anonymize: boolean
  hideCookieActions: boolean
  autoLockMinutes: number
  openAtLogin: boolean
  presencePollSeconds: number
  confirmLaunch: boolean
  sortMode: 'custom' | 'name' | 'status' | 'recent'
  extensionsDir: string
  flagPresets: string[]
  flagCustom: Record<string, string | number | boolean>
  autoUpdate: boolean
  compact: boolean
  robloxPath: string
  syncUrl: string
  syncAuto: boolean
  syncIntervalMin: number
  lastPlaceId: number
}

export interface SyncPayload {
  accounts: Account[]
  cookies: Record<string, string>
  presets: Preset[]
  servers: PrivateServer[]

  tombstones: Record<string, string>
}

export interface SyncState {
  configured: boolean
  url: string
  key: string
  auto: boolean
  intervalMin: number
  busy: boolean
  lastAt?: string
  lastError?: string
  lastSummary?: string
}

export interface VaultStatus {
  initialized: boolean
  locked: boolean
  mode: 'keychain' | 'password'
}

export interface GameServer {
  id: string
  playing: number
  maxPlayers: number
  fps: number
  ping?: number
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'none'
  version?: string
  notes?: string
  percent?: number
  error?: string
}

export interface LaunchTarget {
  placeId: number
  jobId?: string
  linkCode?: string
  accessCode?: string
  followUserId?: number
}

export interface Toast {
  id: string
  kind: 'ok' | 'err' | 'info'
  text: string
}

export interface BulkImportResult {
  ok: boolean
  username?: string
  account?: Account
  error?: string
}

export interface BulkLoginResult {
  index: number
  username?: string
  ok: boolean
  account?: Account
  skipped?: boolean
  error?: string
}
