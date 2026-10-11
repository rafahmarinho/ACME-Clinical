import { AlertTriangle, Inbox, Loader2, RefreshCw, Search, X } from 'lucide-react'
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cx, initials } from '../../lib/format'

// ---------------------------------------------------------------------------- Button

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-navy-900 text-white hover:bg-navy-700 disabled:bg-navy-200 shadow-sm',
  secondary: 'bg-white text-ink border border-line-strong hover:bg-soft hover:border-navy-200 disabled:text-faint',
  ghost: 'text-navy-600 hover:bg-navy-50 disabled:text-faint',
  danger: 'bg-crit text-white hover:bg-[#b42318] disabled:opacity-50 shadow-sm',
  success: 'bg-ok text-white hover:bg-[#05603a] disabled:opacity-50 shadow-sm',
}
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-[15px] gap-2',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold whitespace-nowrap transition disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx('inline-flex size-9 items-center justify-center rounded-lg text-muted transition hover:bg-navy-50 hover:text-ink', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------- Layout

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('card', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <div className="flex size-9 items-center justify-center rounded-lg bg-navy-50 text-navy-600">{icon}</div>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="label mb-1.5">{eyebrow}</div>}
        <h1 className="text-[26px] leading-tight font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'crit' | 'warn' | 'ok' | 'info'
  icon?: ReactNode
}) {
  const tones = {
    default: 'text-ink',
    crit: 'text-crit',
    warn: 'text-warn',
    ok: 'text-ok',
    info: 'text-info',
  }
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      <div className={cx('num mt-2 text-[34px] leading-none font-bold', tones[tone])}>{value}</div>
      {hint && <div className="mt-2 text-[12.5px] text-muted">{hint}</div>}
    </Card>
  )
}

// ---------------------------------------------------------------------------- Feedback

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-navy-500', className)} />
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted">
      <Spinner className="size-7" />
      {label}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />
}

export function SkeletonRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx('space-y-3 p-5', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

export function EmptyState({ title, description, icon, action }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-navy-50 text-navy-500">{icon ?? <Inbox className="size-6" />}</div>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry, compact }: { message: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-6' : 'px-6 py-14')} role="alert">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-crit-soft text-crit">
        <AlertTriangle className="size-6" />
      </div>
      <h3 className="text-[15px] font-semibold text-ink">We couldn't load this information</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function InlineAlert({ tone = 'crit', title, children, onClose }: { tone?: 'crit' | 'warn' | 'info' | 'ok'; title?: string; children?: ReactNode; onClose?: () => void }) {
  const tones = {
    crit: 'border-crit-line bg-crit-soft text-[#912018]',
    warn: 'border-warn-line bg-warn-soft text-[#93370d]',
    info: 'border-info-line bg-info-soft text-[#1849a9]',
    ok: 'border-ok-line bg-ok-soft text-[#05603a]',
  }
  return (
    <div className={cx('flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm', tones[tone])} role={tone === 'crit' ? 'alert' : 'status'}>
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------- Badges

type Tone = 'neutral' | 'crit' | 'warn' | 'ok' | 'info' | 'navy' | 'violet'
const BADGE_TONES: Record<Tone, string> = {
  neutral: 'bg-soft text-muted border-line',
  crit: 'bg-crit-soft text-crit border-crit-line',
  warn: 'bg-warn-soft text-warn border-warn-line',
  ok: 'bg-ok-soft text-ok border-ok-line',
  info: 'bg-info-soft text-info border-info-line',
  navy: 'bg-navy-50 text-navy-700 border-navy-100',
  violet: 'bg-[#f4f3ff] text-[#5925dc] border-[#d9d6fe]',
}

export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap', BADGE_TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  if (url) return <img src={url} alt={name} className="shrink-0 rounded-full object-cover ring-2 ring-white" style={{ width: size, height: size }} />
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-navy-100 font-semibold text-navy-700 ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </div>
  )
}

// ---------------------------------------------------------------------------- Forms

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="text-[12.5px] text-crit">{error}</p> : hint ? <p className="text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('input', className)} {...rest} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('input h-auto min-h-24 py-2.5 leading-relaxed', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('input cursor-pointer pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
      <input className="input pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && (
        <button className="absolute top-1/2 right-2.5 -translate-y-1/2 text-faint hover:text-ink" onClick={() => onChange('')} aria-label="Clear search">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={cx('flex items-start justify-between gap-4', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-navy-900' : 'bg-line-strong')}
      >
        <span className={cx('absolute top-0.5 size-5 rounded-full bg-white shadow transition', checked ? 'left-5.5' : 'left-0.5')} />
      </button>
    </label>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number; tone?: 'crit' | 'warn' }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            '-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap transition',
            value === it.value ? 'border-navy-900 text-ink' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span
              className={cx(
                'num rounded-full px-1.5 py-px text-[11px]',
                it.tone === 'crit' && it.count > 0 ? 'bg-crit text-white' : it.tone === 'warn' && it.count > 0 ? 'bg-warn-soft text-warn' : 'bg-soft text-muted',
              )}
            >
              {it.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function Segmented<T extends string | number>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-line-strong bg-soft p-0.5">
      {items.map((it) => (
        <button
          key={String(it.value)}
          onClick={() => onChange(it.value)}
          className={cx('rounded-md px-3 py-1.5 text-[13px] font-semibold transition', value === it.value ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink')}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="mt-1 text-sm font-medium break-words text-ink">{children}</dd>
    </div>
  )
}
