import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useStore } from '../store'
import { api } from '../lib/api'

export default function TitleBar({ bare }: { bare?: boolean }) {
  const busy = useStore((s) => s.busy)
  const accounts = useStore((s) => s.accounts)
  const [version, setVersion] = useState('')
  const [mac, setMac] = useState(true)

  useEffect(() => {
    void api
      .call<{ version: string; platform: string }>('app:info')
      .then((i) => {
        setVersion(i.version)
        setMac(i.platform === 'darwin')
      })
      .catch(() => undefined)
  }, [])

  const online = accounts.filter((a) => a.presence.type > 0).length

  return (
    <header
      className="drag flex h-10 shrink-0 items-center gap-3 px-3 text-[12px]"
      style={{ paddingInlineStart: mac ? 84 : 12 }}
    >
      <span className="font-semibold tracking-[-0.01em] text-[13px]">TrapRAM</span>
      {version ? <span className="num text-[var(--color-faint)]">v{version}</span> : null}

      {!bare && (
        <span className="num ml-2 text-[var(--color-faint)]">
          {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
          {online > 0 ? ` · ${online} online` : ''}
        </span>
      )}

      {busy ? (
        <span className="ml-auto flex items-center gap-2 text-[var(--color-dim)]">
          <Loader2 size={13} strokeWidth={2} className="animate-spin" />
          {busy}
        </span>
      ) : null}
    </header>
  )
}
