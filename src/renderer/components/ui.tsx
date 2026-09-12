import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'
import { useStore } from '../store'

type Variant = 'primary' | 'soft' | 'ghost' | 'danger'

export function Button({
  variant = 'soft',
  loading,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button type="button" {...rest} aria-busy={loading || undefined} className={`btn btn-${variant} ${className}`} disabled={rest.disabled || loading}>
      {loading ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : null}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`btn btn-ghost h-8 w-8 !px-0 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`field ${className}`} {...rest} />
}

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="mb-1.5">
      {htmlFor ? <label htmlFor={htmlFor} className="text-[12px] font-semibold text-[var(--color-dim)]">{children}</label> : <div className="text-[12px] font-semibold text-[var(--color-dim)]">{children}</div>}
      {hint ? <div className="text-[11.5px] text-[var(--color-faint)]">{hint}</div> : null}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <label
      className={`flex items-start gap-3 py-2 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      data-disabled={disabled}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative mt-0.5 h-[24px] w-[38px] shrink-0 rounded-full transition-colors duration-150 ease-[var(--ease-out)] disabled:opacity-45"
        style={{
          background: checked ? 'var(--color-accent)' : 'var(--color-raised)',
          boxShadow: checked ? 'none' : 'inset 0 0 0 1px var(--color-line-strong)'
        }}
      >
        <span
          className="absolute top-[4px] h-[16px] w-[16px] rounded-full bg-white transition-[left] duration-150 ease-[var(--ease-out)]"
          style={{ left: checked ? '18px' : '4px' }}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{label}</span>
        {hint ? <span className="block text-[11.5px] text-[var(--color-faint)]">{hint}</span> : null}
      </span>
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented inline-flex flex-wrap gap-1 rounded-[10px] bg-[var(--color-bg-deep)] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          data-active={value === o.value}
          className="tab !h-[26px] !text-[12px]"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    setError('')
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    dialog.querySelector<HTMLElement>('[autofocus]:not(:disabled), [data-modal-body] input:not(:disabled), [data-modal-body] textarea:not(:disabled), [data-modal-body] select:not(:disabled)')?.focus()
    const unsubscribe = useStore.subscribe((state, previous) => {
      const latest = state.toasts.at(-1)
      if (latest?.kind === 'err' && latest.id !== previous.toasts.at(-1)?.id) setError(latest.text)
    })
    return () => { unsubscribe(); dialog.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }) }
  }, [open])

  if (!open) return null
  return (
    <dialog
      ref={ref}
      className="modal panel rise"
      style={{ maxWidth: wide ? 640 : 460 }}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-content">
        <div className="flex items-start gap-4 px-5 pt-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-[13px] text-[var(--color-dim)]">{description}</p>
            ) : null}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-1.5 -mt-1">
            <X size={16} strokeWidth={2} />
          </IconButton>
        </div>
        {children ? (
          <div data-modal-body className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
            {children}
          </div>
        ) : (
          <div className="h-2" />
        )}
        {error && <p role="alert" className="mx-5 mb-4 rounded-lg border border-[var(--color-bad)] p-3 text-[13px] text-[var(--color-bad)]">{error}</p>}
        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-[var(--color-bg-deep)]/60 px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </dialog>
  )
}

export function Empty({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-[12px] bg-[var(--color-raised)] text-[var(--color-faint)]">
        {icon}
      </div>
      <div>
        <div className="text-[13.5px] font-semibold">{title}</div>
        {hint ? <p className="mt-1 max-w-[38ch] text-[12.5px] text-[var(--color-dim)] text-balance">{hint}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function Section({ title, hint, children, actions }: { title: string; hint?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="content-section mb-8">
      <div className="section-heading mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
          {hint ? <p className="text-[12px] text-[var(--color-faint)]">{hint}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
