import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Loader2, X } from 'lucide-react'

type Variant = 'primary' | 'soft' | 'ghost' | 'danger'

export function Button({
  variant = 'soft',
  loading,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button {...rest} className={`btn btn-${variant} ${className}`} disabled={rest.disabled || loading}>
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

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <div className="text-[12px] font-semibold text-[var(--color-dim)]">{children}</div>
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
      className={`flex items-start gap-3 py-2 ${disabled ? 'opacity-45' : 'cursor-pointer'}`}
      data-disabled={disabled}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative mt-0.5 h-[20px] w-[34px] shrink-0 rounded-full transition-colors duration-150 ease-[var(--ease-out)]"
        style={{
          background: checked ? 'var(--color-accent)' : 'var(--color-raised)',
          boxShadow: checked ? 'none' : 'inset 0 0 0 1px var(--color-line-strong)'
        }}
      >
        <span
          className="absolute top-[3px] h-[14px] w-[14px] rounded-full bg-white transition-[left] duration-150 ease-[var(--ease-out)]"
          style={{ left: checked ? '17px' : '3px' }}
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
    <div className="inline-flex gap-1 rounded-[10px] bg-[var(--color-bg-deep)] p-1">
      {options.map((o) => (
        <button
          key={o.value}
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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const body = ref.current?.querySelector<HTMLElement>('[data-modal-body]')
    ;(body?.querySelector<HTMLElement>('input, select, textarea') ?? body?.querySelector<HTMLElement>('button'))?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        className="panel rise relative w-full overflow-hidden"
        style={{ maxWidth: wide ? 640 : 420 }}
      >
        <div className="flex items-start gap-4 px-5 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-[12.5px] text-[var(--color-dim)]">{description}</p>
            ) : null}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-1.5 -mt-1">
            <X size={16} strokeWidth={2} />
          </IconButton>
        </div>
        {children ? (
          <div data-modal-body className="px-5 py-4">
            {children}
          </div>
        ) : (
          <div className="h-2" />
        )}
        {footer ? (
          <div className="flex justify-end gap-2 border-t bg-[var(--color-bg-deep)]/60 px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
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
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-[13px] font-semibold tracking-[-0.01em]">{title}</h3>
          {hint ? <p className="text-[12px] text-[var(--color-faint)]">{hint}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
