import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck, Fingerprint } from 'lucide-react'
import type { VaultStatus } from '@shared/types'
import { api, getData } from '../lib/api'
import { useStore } from '../store'
import { Button, Input, Label } from './ui'

export default function LockScreen({ status }: { status: VaultStatus }) {
  const { run, toast } = useStore()
  const [mode, setMode] = useState<'keychain' | 'password'>(status.mode)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  const setup = !status.initialized

  useEffect(() => {
    if (setup || status.mode !== 'keychain') return
    void unlock()
  }, [])

  async function unlock() {
    setBusy(true)
    const snap = await run('Unlocking', () => api.call('vault:unlock', pw))
    setBusy(false)
    if (snap) {
      setPw('')
      useStore.setState({ vault: { ...status, locked: false }, ...(snap as object) })
    }
  }

  async function create() {
    if (mode === 'password' && pw !== pw2) return toast('err', 'The two passwords do not match')
    setBusy(true)
    const snap = await run('Creating vault', () => api.call('vault:create', mode, pw))
    setBusy(false)
    if (snap) {
      useStore.setState({ vault: { initialized: true, locked: false, mode }, ...(snap as object) })
      useStore.setState(await getData())
    }
  }

  return (
    <div className="grid h-[calc(100%-2.5rem)] place-items-center px-6">
      <div className="panel rise w-full max-w-[400px] p-6">
        <div
          className="mb-4 grid h-11 w-11 place-items-center rounded-[13px]"
          style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent-text)' }}
        >
          {setup ? <ShieldCheck size={20} strokeWidth={1.75} /> : <KeyRound size={20} strokeWidth={1.75} />}
        </div>

        <h1 className="text-[17px] font-semibold tracking-[-0.015em]">
          {setup ? 'Set up your vault' : 'Vault locked'}
        </h1>
        <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-dim)] text-balance">
          {setup
            ? 'Cookies are encrypted with AES-256-GCM before anything touches the disk. Pick how the key is protected.'
            : status.mode === 'keychain'
              ? 'Unlock with your system keychain to continue.'
              : 'Enter your master password to decrypt your accounts.'}
        </p>

        {setup ? (
          <>
            <div className="mt-5 grid gap-2">
              <ModeCard
                active={mode === 'keychain'}
                onClick={() => setMode('keychain')}
                icon={<Fingerprint size={16} strokeWidth={1.75} />}
                title="System keychain"
                hint="Keychain on macOS, DPAPI on Windows. Unlocks with your OS account."
              />
              <ModeCard
                active={mode === 'password'}
                onClick={() => setMode('password')}
                icon={<KeyRound size={16} strokeWidth={1.75} />}
                title="Master password"
                hint="scrypt-derived key. Nothing can read the vault without it — including you, if you forget it."
              />
            </div>

            {mode === 'password' ? (
              <div className="mt-4 grid gap-3">
                <div>
                  <Label hint="At least 8 characters">Master password</Label>
                  <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
                </div>
                <div>
                  <Label>Confirm</Label>
                  <Input
                    type="password"
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void create()}
                  />
                </div>
              </div>
            ) : null}

            <Button
              variant="primary"
              className="mt-5 w-full"
              loading={busy}
              disabled={mode === 'password' && pw.length < 8}
              onClick={() => void create()}
            >
              Create vault
            </Button>
          </>
        ) : (
          <div className="mt-5 grid gap-3">
            {status.mode === 'password' ? (
              <Input
                type="password"
                placeholder="Master password"
                value={pw}
                autoFocus
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void unlock()}
              />
            ) : null}
            <Button variant="primary" loading={busy} onClick={() => void unlock()}>
              Unlock
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  hint
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  hint: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 rounded-[10px] p-3 text-start transition-[background-color,box-shadow] duration-150 ease-[var(--ease-out)]"
      style={{
        background: active ? 'var(--color-accent-soft)' : 'var(--color-raised)',
        boxShadow: active ? 'inset 0 0 0 1px oklch(0.658 0.196 288 / 0.4)' : 'inset 0 0 0 1px var(--color-line)'
      }}
      aria-pressed={active}
    >
      <span className="mt-0.5" style={{ color: active ? 'var(--color-accent-text)' : 'var(--color-faint)' }}>
        {icon}
      </span>
      <span>
        <span className="block text-[13px] font-semibold">{title}</span>
        <span className="block text-[11.5px] leading-snug text-[var(--color-dim)]">{hint}</span>
      </span>
    </button>
  )
}
