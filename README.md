# TrapRAM

A Roblox account manager for macOS and Windows. Sign in through a built-in browser, keep every session encrypted, and launch any account into any server without touching your normal browser profile.

## Features

**Accounts**
- Sign in through an isolated, throwaway Chromium window — the session cookie never passes through your everyday browser
- Or paste a `.ROBLOSECURITY` cookie if you're migrating from another manager
- Groups, aliases, notes, pinning, manual drag ordering, search across every field
- Live presence (Offline / Online / In game / In Studio) with avatars
- Moderation and expired-session detection on every account
- Anonymize mode: hides usernames and avatars for screen sharing

**Launching**
- Launch one account or a whole selection into the same place, with a configurable delay between each
- Server browser: list every public server for a place and send the selection into one exact server
- "Join an account": pile every selected account into the server one of your accounts is already in
- Launch presets and saved private servers (share links resolved once, access code stored)
- Recently played: the eight latest experiences for an account, with quick launch and favourite actions
- Player actions: find users by username or User ID, see their activity and current experience when shared, send friend requests, follow them and join their current server. Activity refreshes every 15 seconds; joins recheck the displayed destination before launching
- Multi-client on both platforms, window tiling on both platforms

  Windows holds the `ROBLOX_singletonMutex` for as long as TrapRAM is open. That lock can only be taken while no client owns it, so turn the setting on with every Roblox window closed — TrapRAM says so instead of failing quietly if a client got there first. macOS needs three locks undone: `LSMultipleInstancesProhibited` in `Info.plist`, the `/RobloxPlayerUniq` POSIX semaphore, and the code signature — patching the plist breaks the seal the main executable carries over it, so the kernel refuses the binary with `EBADEXEC` until the clone is re-signed ad-hoc with Roblox's own entitlements plus `disable-library-validation`. Clones are APFS copy-on-write (about 2.5 MB of real disk each) and live in numbered slots rather than being rebuilt per launch, so macOS asks for microphone and camera access once per slot instead of on every launch.

**Per-account browser**
- Every account opens in a throwaway in-memory Chromium session with a proper toolbar; the cookie is injected on open and the whole session is wiped when the window closes, so nothing is written to disk
- Drop unpacked Chrome extensions into the extensions folder and they load into every account window
- Roblox share links opened in the built-in browser are resolved and launched through the selected account
- Navigation is pinned to Roblox and its login providers; anything else opens in your system browser

**Performance**
- Live table of running clients: memory, CPU, uptime, priority
- Set process priority, limit CPU cores, release working-set memory (Windows), close individual clients
- Client tuning presets that write `ClientAppSettings.json` — low-end, unlocked FPS, quiet network, lean memory — plus a raw editor

**Anti-association**

Roblox keeps its per-machine identity in files every account shares. On macOS that is `~/Library/Roblox/LocalStorage/appStorage.json`, which holds a fixed `AppInstallationId`, a fixed `BrowserTrackerId`, and maps like `DeviceLevelTheme` that literally list every user id that has ever signed in on the machine. Clearing `RobloxCookies.dat` never touched any of it, and that file does not exist on macOS at all.

- Each account gets its own copy of the client identity files, swapped in before launch, with the shared identity stripped and the install and tracker ids regenerated
- A fresh profile starts from a sanitized copy: settings and device names survive, anything that names an account does not
- The browser tracker id is randomized on every launch URI
- The built-in browser keeps nothing between sessions, so Roblox's web-side tracking cookies never build up or mix between accounts

It cannot isolate two clients running at the same time — they share one live file — and it does nothing about your IP address. Both are stated in the app, not hidden.

**Security**
- Session cookies are renewed on a schedule by redeeming an auth ticket, so long-lived accounts do not age out
- Cookies are sealed with AES-256-GCM before anything reaches the disk
- The vault key is wrapped either by the OS keychain (macOS Keychain / Windows DPAPI) or by a scrypt-derived master password
- Auto-lock on idle, cookie copying off by default, clipboard self-clears after 45 seconds when you do copy
- Encrypted backups with their own separate password
- Renderer runs sandboxed with context isolation and a strict CSP; cookies never leave the main process

**Sync across devices**

Two machines keep the same accounts, sessions, groups, presets and private servers through a relay you deploy yourself — a ~50 line Cloudflare Worker (see [`worker/`](worker)).

The relay is blind. The room id and the encryption key are both derived from a 25-character sync key that never leaves either machine, so it stores one AES-256-GCM blob and cannot tell whose it is or what is in it.

- Merges instead of overwriting: the newest edit wins per account, and the session is picked separately, so an account that is signed in on the laptop and expired on the desktop keeps the cookie that still works
- Deletes stay deleted, and re-adding an account still beats an older delete
- Presence, avatars and launch times are left out — they are polled or machine-specific, and syncing them would have both devices writing forever
- A write only happens when the merged result differs from what the relay already holds. Two machines checking every 15 minutes land around 200 requests a day, roughly 0.2% of a free Cloudflare plan
- Disconnecting can wipe the relay copy on the way out

**Updates**
- Checks GitHub releases, tells you what changed, and only installs when you say so

## Installing

**macOS** — open the `.dmg` from [Releases](https://github.com/TrapstarKS/TrapRAM/releases/latest) and drag TrapRAM onto the Applications shortcut inside it. The build is ad-hoc signed rather than notarized, so macOS quarantines it on first open. Clear that once:

```bash
xattr -cr /Applications/TrapRAM.app
```

Then open it normally. Multi-client also needs the Xcode command line tools (`xcode-select --install`) since it re-signs its Roblox clones.

**Windows** — run the `.exe` installer from Releases and pick where it goes.

## Publishing a release

Bump `version` in `package.json`, then push a tag:

```bash
git tag -a v1.0.1 -m "TrapRAM 1.0.1"
git push origin v1.0.1
```

GitHub Actions builds on macOS and Windows, uploads both installers plus `latest-mac.yml` / `latest.yml` to a draft release, and strips the delta blockmaps. Publish the draft and existing installs pick it up within a few hours, or immediately via Settings → Check now.

Building by hand works too, but not from a folder iCloud syncs — the File Provider stamps `com.apple.FinderInfo` on the bundle and `codesign` refuses to touch it.

## Running from source

```bash
npm install
npm run dev
```

## Building

```bash
npm run pack:mac    # dmg + zip, arm64 and x64
npm run pack:win    # nsis installer
```

Set `publish.owner` in `electron-builder.yml` to your GitHub account before shipping, otherwise the auto-updater has nowhere to look.

```bash
npm run typecheck
npm test
```

The interface also has browser tests and a native Electron smoke test:

```bash
npx playwright install chromium  # once per machine
npm run test:ui
npm run test:electron            # builds first; requires a desktop session
```

Browser tests use fictional accounts and a mocked IPC boundary. They check selection, launch payloads, player activity, failed saves, search races, keyboard access, both themes, reduced motion, and narrow layouts. The Electron test creates and removes its own temporary password vault; it checks the real preload/IPC, setup, navigation, theme persistence, 200% zoom, locking, and player presence/destination checks with intercepted Roblox responses. Neither suite needs Roblox credentials or launches a game. Screenshots and failure traces are saved under `test-results/`.

See [the UX verification notes](docs/ux-review.md) for the changes and coverage limits.

## Notes

macOS asks for Accessibility permission the first time you arrange windows, and only then — TrapRAM never re-prompts on its own. Multi-client on macOS needs the Xcode command line tools (`xcode-select --install`) because it re-signs its Roblox clones. Multi-client and client tuning are off by default and change how the game runs on your machine; they are opt-in for a reason.

Not affiliated with or endorsed by Roblox Corporation.

## Credits

Inspired by [Roblox Account Manager](https://github.com/ic3w0lf22/Roblox-Account-Manager) by ic3w0lf22 and [RM](https://github.com/centerepic/robloxmanager) by centerepic.

## License

MIT
