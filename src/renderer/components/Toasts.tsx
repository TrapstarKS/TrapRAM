import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { useStore } from '../store'

const ICON = { ok: CheckCircle2, err: AlertTriangle, info: Info }
const COLOR = { ok: 'var(--color-ok)', err: 'var(--color-bad)', info: 'var(--color-accent-text)' }

export default function Toasts() {
  const { toasts, dismiss } = useStore()

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex max-h-[calc(100dvh-80px)] w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2 overflow-y-auto" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICON[t.kind]
        return (
          <div
            key={t.id}
            className="panel rise pointer-events-auto flex items-start gap-2.5 px-3 py-2.5"
            role={t.kind === 'err' ? 'alert' : undefined}
          >
            <Icon size={15} strokeWidth={2} style={{ color: COLOR[t.kind] }} className="mt-px shrink-0" />
            <p className="min-w-0 flex-1 text-[12.5px] leading-snug break-words">{t.text}</p>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="-mr-1 -mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded text-[var(--color-faint)] transition-colors hover:text-[var(--color-text)]"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
