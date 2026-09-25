import { useEffect, useState } from 'react'
import {
  Puzzle,
  FolderOpen,
  DownloadCloud,
  ShieldCheck,
  HardDriveDownload,
  HardDriveUpload,
  TimerReset,
  Info
} from 'lucide-react'
import type { VaultStatus } from '@shared/types'
import { useStore } from '../store'
import { api } from '../lib/api'
import { Button, Input, Label, Section, Segmented, Switch, Modal } from './ui'
import SyncSection from './SyncSection'

export default function SettingsPanel() {
  const { settings, vault, patchSettings, run, toast, update } = useStore()
  const [info, setInfo] = useState<{ version: string; platform: string; packaged: boolean; dataDir: string } | null>(null)
  const [pwOpen, setPwOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState<'export' | 'import' | null>(null)
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [backupPw, setBackupPw] = useState('')
  const [merge, setMerge] = useState(true)

  useEffect(() => {
    void api.call<typeof info>('app:info').then(setInfo).catch(() => undefined)
  }, [])

  if (!settings) return null
  const win = info?.platform === 'win32'

  return (
    <div className="settings-content max-w-[760px] p-5">
      <Section title="Appearance">
        <div className="settings-row items-center justify-between py-1">
          <span className="text-[13px] font-medium">Theme</span>
          <Segmented
            value={settings.theme}
            onChange={(theme) => void patchSettings({ theme })}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' }
            ]}
          />
        </div>
        <Switch
          checked={settings.anonymize}
          onChange={(anonymize) => void patchSettings({ anonymize })}
          label="Anonymize accounts"
          hint="Hides usernames and avatars behind generic labels — useful when streaming or sharing a screen"
        />
        <Switch
          checked={settings.openAtLogin}
          onChange={(openAtLogin) => void patchSettings({ openAtLogin })}
          label={win ? 'Start with Windows' : 'Start when I log in'}
          hint="Opens TrapRAM automatically. The vault still asks to be unlocked before anything is readable."
        />
      </Section>

      <Section title="Launching">
        <div className="settings-row items-center justify-between py-2">
          <span className="min-w-0">
            <span className="block text-[13px] font-medium">Delay between launches</span>
            <span className="block text-[11.5px] text-[var(--color-faint)]">
              Roblox rate-limits rapid launches from the same address
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Input
              aria-label="Delay between launches in seconds"
              className="num !h-[30px] !w-[76px] text-center"
              inputMode="numeric"
              value={String(settings.launchDelayMs / 1000)}
              onChange={(e) => {
                const secs = Math.max(0, Math.min(60, Number(e.target.value.replace(/[^\d.]/g, '')) || 0))
                void patchSettings({ launchDelayMs: Math.round(secs * 1000) })
              }}
            />
            <span className="text-[12px] text-[var(--color-faint)]">sec</span>
          </div>
        </div>

        <Switch
          checked={settings.isolateProfiles}
          onChange={(isolateProfiles) => void patchSettings({ isolateProfiles })}
          label="Give each account its own client profile"
          hint="Each account gets its own copy of Roblox's install and tracker IDs, so the client looks freshly installed. Skipped while another client is running."
        />
        {win && <>
          <Switch
            checked={settings.privacyMode}
            onChange={(privacyMode) => void patchSettings({ privacyMode })}
            label="Wipe RobloxCookies.dat before each launch"
            hint="Not enough on its own — keep profile isolation on too"
          />
          <Switch
            checked={settings.killTrayProcesses}
            onChange={(killTrayProcesses) => void patchSettings({ killTrayProcesses })}
            label="Close Roblox instances that linger in the tray"
            hint="Checks every minute and closes idle clients with no game attached. Clients in a game are left alone."
          />
        </>}
        <Switch
          checked={settings.multiInstance}
          onChange={(multiInstance) => void patchSettings({ multiInstance })}
          label="Allow multiple clients at once"
          hint={
            win
              ? 'Turn this on with every Roblox client closed. Touches anti-cheat territory — your call.'
              : 'Runs each client from its own lightweight copy of Roblox.app. Touches anti-cheat territory — your call.'
          }
        />
      </Section>

      <Section title="Security">
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[10px] bg-[var(--color-raised)] px-3 py-2.5">
          <ShieldCheck size={15} strokeWidth={1.75} style={{ color: 'var(--color-ok)' }} />
          <span className="text-[12.5px]">
            Vault key protected by{' '}
            <strong>{vault?.mode === 'keychain' ? (win ? 'Windows DPAPI' : 'the macOS keychain') : 'your master password'}</strong>
          </span>
          <Button className="!h-[26px] ms-auto !text-[12px]" onClick={() => setPwOpen(true)}>
            {vault?.mode === 'keychain' ? 'Set a password' : 'Change password'}
          </Button>
        </div>

        <div className="settings-row items-center justify-between py-2">
          <span className="min-w-0">
            <span className="block text-[13px] font-medium">Auto-lock when idle</span>
            <span className="block text-[11.5px] text-[var(--color-faint)]">0 keeps the vault open until you quit</span>
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Input
              aria-label="Auto-lock after minutes"
              className="num !h-[30px] !w-[76px] text-center"
              inputMode="numeric"
              value={String(settings.autoLockMinutes)}
              onChange={(e) =>
                void patchSettings({ autoLockMinutes: Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0) })
              }
            />
            <span className="text-[12px] text-[var(--color-faint)]">min</span>
          </div>
        </div>

        <Switch
          checked={settings.autoRefreshCookies}
          onChange={(autoRefreshCookies) => void patchSettings({ autoRefreshCookies })}
          label="Renew session cookies automatically"
          hint="Every 12 hours TrapRAM trades each session for a fresh one so long-lived accounts do not age out"
        />
        <div className="flex items-center gap-3 pb-1">
          <Button
            onClick={() =>
              void run('Renewing sessions', () =>
                api.call<{ renewed: number; failed: number; skipped: number }>('account:refreshCookies')
              ).then(
                (r) =>
                  r &&
                  toast(
                    r.failed ? 'err' : 'ok',
                    `${r.renewed} renewed${r.failed ? `, ${r.failed} failed — those need a fresh sign-in` : ''}${
                      r.skipped ? `, ${r.skipped} left alone — you are connecting from another country` : ''
                    }`
                  )
              )
            }
          >
            <TimerReset size={14} strokeWidth={1.75} />
            Renew all sessions now
          </Button>
        </div>

        <Switch
          checked={settings.hideCookieActions}
          onChange={(hideCookieActions) => void patchSettings({ hideCookieActions })}
          label="Block cookie copying"
          hint="Removes the copy action entirely — a stolen cookie is a stolen account"
        />

        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={() => setBackupOpen('export')}>
            <HardDriveDownload size={14} strokeWidth={1.75} />
            Export backup
          </Button>
          <Button className="flex-1" onClick={() => setBackupOpen('import')}>
            <HardDriveUpload size={14} strokeWidth={1.75} />
            Import backup
          </Button>
        </div>
      </Section>

      <SyncSection />

      <Section
        title="Built-in browser"
        hint="Throwaway Chromium session per window — the cookie is injected on open and everything is wiped on close"
      >
        <div className="flex items-center gap-2 rounded-[10px] bg-[var(--color-raised)] px-3 py-2.5">
          <Puzzle size={15} strokeWidth={1.75} className="text-[var(--color-accent-text)]" />
          <span className="min-w-0 flex-1 text-[12.5px] leading-snug">
            Drop unpacked Chrome extensions in the extensions folder and they load into every account window.
          </span>
          <Button
            className="!h-[26px] shrink-0 !text-[12px]"
            onClick={() => void run('Opening folder', () => api.call('system:openExtensions'))}
          >
            <FolderOpen size={13} strokeWidth={1.75} />
            Open
          </Button>
        </div>
      </Section>

      <Section title="Updates">
        <Switch
          checked={settings.autoUpdate}
          onChange={(autoUpdate) => void patchSettings({ autoUpdate })}
          label="Check for updates automatically"
          hint="TrapRAM never installs anything without asking first"
        />
        <div className="mt-2 flex items-center gap-3">
          <Button
            onClick={() =>
              void run('Checking for updates', () => api.call('update:check')).then(() => {
                const s = useStore.getState().update.status
                if (s === 'none') toast('ok', 'You are on the latest version')
                if (s === 'error') toast('err', useStore.getState().update.error ?? 'Update check failed')
              })
            }
          >
            <DownloadCloud size={14} strokeWidth={1.75} />
            Check now
          </Button>
          <span className="text-[11.5px] text-[var(--color-faint)]">
            {update.status === 'checking' ? 'Checking…' : info?.packaged ? '' : 'Updates only run in a packaged build'}
          </span>
        </div>
      </Section>

      <Section title="About">
        <div className="flex items-start gap-2 rounded-[10px] bg-[var(--color-raised)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--color-dim)]">
          <Info size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[var(--color-faint)]" />
          <span className="min-w-0 break-words">
            TrapRAM {info?.version} · {info?.platform}
            <br />
            Data lives in <span className="font-mono text-[11px]">{info?.dataDir}</span>
            <br />
            Not affiliated with Roblox Corporation. Multi-client and client tuning change how the game runs on your
            machine — use them knowing that.
          </span>
        </div>
      </Section>

      <Modal
        open={pwOpen}
        title={vault?.mode === 'keychain' ? 'Switch to a master password' : 'Change master password'}
        description="The vault key is re-wrapped. Your accounts are not re-encrypted, so this is instant."
        onClose={() => setPwOpen(false)}
        footer={
          <>
            <Button onClick={() => setPwOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={next.length < 8}
              onClick={() =>
                void run(
                  'Updating password',
                  () => api.call<VaultStatus>('vault:changePassword', cur, next),
                  'Password updated'
                ).then((status) => {
                  if (!status) return
                  useStore.setState({ vault: status })
                  setPwOpen(false)
                  setCur('')
                  setNext('')
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          {vault?.mode === 'password' && (
            <div>
              <Label htmlFor="settingspanel-current-password">Current password</Label>
              <Input id="settingspanel-current-password" type="password" value={cur} onChange={(e) => setCur(e.target.value)} />
            </div>
          )}
          <div>
            <Label htmlFor="settingspanel-new-password" hint="At least 8 characters">New password</Label>
            <Input id="settingspanel-new-password" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!backupOpen}
        title={backupOpen === 'export' ? 'Export encrypted backup' : 'Import encrypted backup'}
        description={
          backupOpen === 'export'
            ? 'The file is encrypted with its own password. Losing that password loses the backup.'
            : 'Enter the password the backup was created with.'
        }
        onClose={() => setBackupOpen(null)}
        footer={
          <>
            <Button onClick={() => setBackupOpen(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={backupPw.length < 8}
              onClick={() => {
                const job =
                  backupOpen === 'export'
                    ? run('Exporting', () => api.call<string | null>('backup:export', backupPw))
                    : run('Importing', () => api.call<number | null>('backup:import', backupPw, merge))
                void job.then((res) => {
                  if (res === null || res === undefined) return
                  toast('ok', backupOpen === 'export' ? 'Backup saved' : `Imported ${res} accounts`)
                  setBackupOpen(null)
                  setBackupPw('')
                })
              }}
            >
              {backupOpen === 'export' ? 'Choose location' : 'Choose file'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <div>
            <Label htmlFor="settingspanel-backup-password" hint="At least 8 characters">Backup password</Label>
            <Input id="settingspanel-backup-password" type="password" value={backupPw} onChange={(e) => setBackupPw(e.target.value)} />
          </div>
          {backupOpen === 'import' && (
            <Switch
              checked={merge}
              onChange={setMerge}
              label="Merge with existing accounts"
              hint="Turn this off to replace everything currently in the vault"
            />
          )}
        </div>
      </Modal>
    </div>
  )
}
