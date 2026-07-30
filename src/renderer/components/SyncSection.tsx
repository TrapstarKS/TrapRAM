import { useEffect, useState } from 'react'
import { Check, Copy, Eye, EyeOff, RefreshCw, Unplug } from 'lucide-react'
import type { SyncState } from '@shared/types'
import { useStore } from '../store'
import { api, relative } from '../lib/api'
import { Button, Input, Label, Modal, Section, Switch } from './ui'

const MASK = '•••••-•••••-•••••-•••••-•••••'

export default function SyncSection() {
  const { settings, patchSettings, run, toast } = useStore()
  const [state, setState] = useState<SyncState | null>(null)
  const [url, setUrl] = useState('')
  const [joinKey, setJoinKey] = useState('')
  const [reveal, setReveal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [disconnect, setDisconnect] = useState(false)
  const [wipe, setWipe] = useState(true)

  useEffect(() => {
    void api
      .call<SyncState>('sync:state')
      .then((s) => {
        setState(s)
        setUrl(s.url)
      })
      .catch(() => undefined)
    return api.on('sync:state', (s: SyncState) => setState(s))
  }, [])

  if (!settings || !state) return null

  const setup = (key?: string) =>
    void run('Setting up sync', () => api.call<SyncState>('sync:setup', url, key)).then((s) => {
      if (!s) return
      setState(s)
      setJoinKey('')
      setReveal(!key)
      toast('ok', key ? 'Paired — pulling accounts' : 'Sync key created')
      void api.call('sync:now').catch(() => undefined)
    })

  const copyKey = () => {
    void navigator.clipboard.writeText(state.key)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Section
      title="Sync across devices"
      hint="Your accounts, sessions and presets travel through a relay you own. It stores one sealed blob and holds no key, so it never sees a cookie."
    >
      {!state.configured ? (
        <div className="grid gap-3">
          <div>
            <Label hint="The worker URL from worker/README.md — https only">Relay URL</Label>
            <Input
              placeholder="https://trapram-relay.you.workers.dev"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Label hint="Leave empty on the first device">Existing sync key</Label>
              <Input
                className="font-mono !text-[12px] tracking-[0.06em]"
                placeholder="ABCDE-FGHJK-MNPQR-STVWX-YZ012"
                value={joinKey}
                onChange={(e) => setJoinKey(e.target.value)}
                spellCheck={false}
              />
            </div>
            <Button variant="primary" disabled={!url.trim()} onClick={() => setup(joinKey.trim() || undefined)}>
              {joinKey.trim() ? 'Pair this device' : 'Create sync key'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="rounded-[12px] bg-[var(--color-raised)] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[12px] font-semibold text-[var(--color-dim)]">Sync key</span>
              <span className="truncate font-mono text-[11px] text-[var(--color-faint)]">{state.url}</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-[8px] bg-[var(--color-bg-deep)] px-2.5 py-2 font-mono text-[12.5px] tracking-[0.08em]">
                {reveal ? state.key : MASK}
              </code>
              <Button
                className="!h-[34px] shrink-0"
                aria-label={reveal ? 'Hide sync key' : 'Show sync key'}
                onClick={() => setReveal(!reveal)}
              >
                {reveal ? <EyeOff size={14} strokeWidth={1.75} /> : <Eye size={14} strokeWidth={1.75} />}
              </Button>
              <Button className="!h-[34px] shrink-0" onClick={copyKey}>
                {copied ? (
                  <Check size={14} strokeWidth={2} style={{ color: 'var(--color-ok)' }} />
                ) : (
                  <Copy size={14} strokeWidth={1.75} />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="mt-2 text-[11.5px] leading-snug text-[var(--color-faint)]">
              Enter this on the other machine to pair it. Anyone holding it can decrypt everything in the room — treat
              it like the master password.
            </p>
          </div>

          <div className="flex items-center gap-3 py-1">
            <Button
              onClick={() =>
                void run('Syncing', () => api.call<Result>('sync:now')).then((r) => r && toast('ok', summary(r)))
              }
            >
              <RefreshCw size={14} strokeWidth={1.75} />
              Sync now
            </Button>
            <span className="min-w-0 text-[11.5px]">
              {state.lastError ? (
                <span style={{ color: 'var(--color-bad)' }}>{state.lastError}</span>
              ) : state.lastAt ? (
                <span className="text-[var(--color-faint)]">
                  Synced {relative(state.lastAt)}
                  {state.lastSummary ? ` · ${state.lastSummary}` : ''}
                </span>
              ) : (
                <span className="text-[var(--color-faint)]">Not synced yet</span>
              )}
            </span>
          </div>

          <Switch
            checked={settings.syncAuto}
            onChange={(syncAuto) => void patchSettings({ syncAuto })}
            label="Sync in the background"
            hint="Runs a few seconds after anything changes here, and on a timer for what changed elsewhere"
          />

          <div className="flex items-center justify-between py-1">
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">Check for remote changes every</span>
              <span className="block text-[11.5px] text-[var(--color-faint)]">
                One request per check — 15 minutes is about 0.2% of a free Cloudflare plan
              </span>
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <Input
                className="num !h-[30px] !w-[76px] text-center"
                inputMode="numeric"
                disabled={!settings.syncAuto}
                value={String(settings.syncIntervalMin)}
                onChange={(e) =>
                  void patchSettings({
                    syncIntervalMin: Math.max(5, Math.min(720, Number(e.target.value.replace(/\D/g, '')) || 5))
                  })
                }
              />
              <span className="text-[12px] text-[var(--color-faint)]">min</span>
            </div>
          </div>

          <div className="pt-1">
            <Button variant="ghost" className="!text-[var(--color-bad)]" onClick={() => setDisconnect(true)}>
              <Unplug size={14} strokeWidth={1.75} />
              Disconnect this device
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={disconnect}
        title="Disconnect from sync"
        description="Nothing in this vault is deleted — only the link to the relay."
        onClose={() => setDisconnect(false)}
        footer={
          <>
            <Button onClick={() => setDisconnect(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() =>
                void run('Disconnecting', () => api.call<SyncState>('sync:disable', wipe)).then((s) => {
                  if (!s) return
                  setState(s)
                  setUrl('')
                  setDisconnect(false)
                  toast('ok', wipe ? 'Disconnected and relay wiped' : 'Disconnected')
                })
              }
            >
              Disconnect
            </Button>
          </>
        }
      >
        <Switch
          checked={wipe}
          onChange={setWipe}
          label="Erase the copy on the relay"
          hint="Leave this on unless the other device still needs to pull from it"
        />
      </Modal>
    </Section>
  )
}

interface Result {
  added: number
  updated: number
  cookies: number
  removed: number
  pulled: boolean
  pushed: boolean
}

function summary(r: Result): string {
  const parts = [
    r.added && `${r.added} account${r.added > 1 ? 's' : ''} added`,
    r.updated && `${r.updated} updated`,
    r.cookies && `${r.cookies} session${r.cookies > 1 ? 's' : ''} recovered`,
    r.removed && `${r.removed} removed`
  ].filter(Boolean)
  if (parts.length) return parts.join(', ')
  return r.pushed ? 'Uploaded to the relay' : 'Everything already matches'
}
