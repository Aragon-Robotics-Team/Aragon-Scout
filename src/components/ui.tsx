import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import type { Alliance } from '../lib/types'

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-bg hover:bg-white',
  secondary: 'bg-surface-2 text-ink border border-line hover:border-ink-3',
  ghost: 'text-ink-2 hover:text-ink',
  danger: 'text-red border border-red/40 hover:bg-red/10',
}

export function Button({
  variant = 'secondary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 h-11 text-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none',
        variants[variant],
        className,
      )}
    />
  )
}

export function Page({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-5">
      {title && (
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {action}
        </div>
      )}
      {children}
    </main>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl border border-line bg-surface', className)}>{children}</div>
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between text-xs font-medium text-ink-2">
      <span>{children}</span>
      {hint && <span className="text-ink-3">{hint}</span>}
    </span>
  )
}

const inputClass =
  'w-full rounded-xl border border-line bg-surface-2 px-3 h-11 text-ink placeholder:text-ink-3 focus:border-ink-3 focus:outline-none'

export function TextInput({ label, hint, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  return (
    <label className={cx('block', className)}>
      <Label hint={hint}>{label}</Label>
      <input {...props} className={inputClass} />
    </label>
  )
}

export function TextArea({ label, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className={cx('block', className)}>
      <Label>{label}</Label>
      <textarea rows={4} {...props} className={cx(inputClass, 'h-auto py-2.5 resize-y')} />
    </label>
  )
}

function parseNum(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

export function NumberInput({
  label,
  value,
  onChange,
  placeholder,
  className,
  hint,
}: {
  label: string
  value: number | null
  onChange(v: number | null): void
  placeholder?: string
  className?: string
  hint?: ReactNode
}) {
  return (
    <label className={cx('block', className)}>
      <Label hint={hint}>{label}</Label>
      <input
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        min={0}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(parseNum(e.target.value))}
        className={cx(inputClass, 'tnum')}
      />
    </label>
  )
}

/** Number field with −/+ for counts entered on a phone. */
export function Stepper({
  label,
  value,
  onChange,
  max,
  hint,
}: {
  label: string
  value: number | null
  onChange(v: number | null): void
  max?: number
  hint?: ReactNode
}) {
  const v = value ?? 0
  const set = (n: number) => onChange(Math.max(0, max == null ? n : Math.min(max, n)))
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      <div className="flex h-11 items-stretch overflow-hidden rounded-xl border border-line bg-surface-2">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => set(v - 1)} className="w-11 text-lg text-ink-2 active:bg-line">
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={label}
          value={value ?? ''}
          placeholder="0"
          onChange={(e) => {
            const n = parseNum(e.target.value)
            onChange(n == null ? null : Math.max(0, max == null ? n : Math.min(max, n)))
          }}
          className="tnum min-w-0 flex-1 bg-transparent text-center text-ink placeholder:text-ink-3 focus:outline-none"
        />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => set(v + 1)} className="w-11 text-lg text-ink-2 active:bg-line">
          +
        </button>
      </div>
    </div>
  )
}

export function AlliancePicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: Alliance | null
  onChange(v: Alliance): void
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="grid h-11 grid-cols-2 gap-2">
        {(['red', 'blue'] as const).map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={value === a}
            onClick={() => onChange(a)}
            className={cx(
              'rounded-xl border text-sm font-medium capitalize transition-colors',
              value === a
                ? a === 'red'
                  ? 'border-red bg-red/15 text-red'
                  : 'border-blue bg-blue/15 text-blue'
                : 'border-line bg-surface-2 text-ink-2',
            )}
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange(v: T): void
  className?: string
}) {
  return (
    <div className={cx('inline-flex rounded-xl border border-line bg-surface p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-9 rounded-[10px] px-3 text-sm transition-colors',
            value === o.value ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-2">{children}</div>}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange(v: string): void; placeholder: string }) {
  return (
    <input
      type="search"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cx(inputClass, 'rounded-full px-4')}
    />
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="tnum mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </div>
  )
}

export function TeamChip({ number, alliance, highlight }: { number: number; alliance: Alliance; highlight?: boolean }) {
  return (
    <span
      className={cx(
        'tnum inline-flex items-center rounded-md px-1.5 py-0.5 text-sm',
        highlight ? (alliance === 'red' ? 'bg-red/20 text-ink font-semibold' : 'bg-blue/20 text-ink font-semibold') : 'text-ink-2',
      )}
    >
      {number}
    </span>
  )
}
