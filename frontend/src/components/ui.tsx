import { X } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react"
import type { BookingStatus, Risk } from "../types"

export function Button({
  variant = "primary",
  className = "",
  loading = false,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger"
  loading?: boolean
}) {
  const styles = {
    primary: "bg-aqua-600 text-white shadow-sm hover:bg-aqua-700",
    secondary: "border border-aqua-200 bg-white text-aqua-800 hover:bg-aqua-50",
    ghost: "text-ink-700 hover:bg-sand-100",
    danger: "bg-danger-600 text-white hover:bg-danger-700",
  }
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold transition duration-200 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-aqua-200 disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

/** Keeps the last non-empty value mounted ~150ms after it clears so an exit animation can play. */
export function useExit(value: string, ms = 150) {
  const [shown, setShown] = useState(value)
  useEffect(() => {
    if (value) {
      setShown(value)
      return
    }
    const t = window.setTimeout(() => setShown(""), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return { value: value || shown, leaving: !value && !!shown }
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className={`size-4 animate-spin ${className}`}
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">Loading</span>
    </>
  )
}

export function Card({
  children,
  className = "",
  animate = false,
}: {
  children: ReactNode
  className?: string
  animate?: boolean
}) {
  return (
    <section
      className={`${animate ? "animate-rise " : ""}rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-shadow duration-300 hover:shadow-md ${className}`}
    >
      {children}
    </section>
  )
}

function FieldMessages({
  id,
  error,
  hint,
}: {
  id: string
  error?: string
  hint?: string
}) {
  return (
    <>
      {hint && (
        <span id={`${id}-hint`} className="text-xs font-normal text-slate-500">
          {hint}
        </span>
      )}
      {error && (
        <span
          id={`${id}-error`}
          role="alert"
          className="text-xs font-medium text-danger-600"
        >
          {error}
        </span>
      )}
    </>
  )
}

function describedBy(
  id: string,
  error?: string,
  hint?: string,
  extra?: string,
) {
  const ids = [extra, hint && `${id}-hint`, error && `${id}-error`].filter(
    Boolean,
  )
  return ids.length ? ids.join(" ") : undefined
}

const errorBorder = "border-danger-500 focus:border-danger-500 focus:ring-danger-100"

export function Input({
  label,
  error,
  hint,
  className = "",
  id: idProp,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
  hint?: string
}) {
  const auto = useId()
  const id = idProp ?? auto
  return (
    <div className="grid gap-2 text-sm font-semibold text-ink-800">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-required={props.required ? true : undefined}
        aria-describedby={describedBy(id, error, hint, props["aria-describedby"])}
        className={`min-h-12 w-full min-w-0 rounded-xl border bg-white px-3.5 text-base font-normal outline-none transition placeholder:text-slate-400 focus:border-aqua-500 focus:ring-4 focus:ring-aqua-100 ${error ? errorBorder : "border-slate-300"} ${className}`}
        {...props}
      />
      <FieldMessages id={id} error={error} hint={hint} />
    </div>
  )
}

export function Textarea({
  label,
  error,
  hint,
  className = "",
  id: idProp,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  error?: string
  hint?: string
}) {
  const auto = useId()
  const id = idProp ?? auto
  return (
    <div className="grid gap-2 text-sm font-semibold text-ink-800">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-required={props.required ? true : undefined}
        aria-describedby={describedBy(id, error, hint, props["aria-describedby"])}
        className={`min-h-24 w-full min-w-0 rounded-xl border bg-white px-3.5 py-3 text-base font-normal outline-none transition placeholder:text-slate-400 focus:border-aqua-500 focus:ring-4 focus:ring-aqua-100 ${error ? errorBorder : "border-slate-300"} ${className}`}
        {...props}
      />
      <FieldMessages id={id} error={error} hint={hint} />
    </div>
  )
}

export function Select({
  label,
  error,
  hint,
  children,
  className = "",
  id: idProp,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  const auto = useId()
  const id = idProp ?? auto
  return (
    <div className="grid gap-2 text-sm font-semibold text-ink-800">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-required={props.required ? true : undefined}
        aria-describedby={describedBy(id, error, hint, props["aria-describedby"])}
        className={`min-h-12 w-full min-w-0 rounded-xl border bg-white px-3.5 text-base font-normal outline-none focus:border-aqua-500 focus:ring-4 focus:ring-aqua-100 ${error ? errorBorder : "border-slate-300"} ${className}`}
        {...props}
      >
        {children}
      </select>
      <FieldMessages id={id} error={error} hint={hint} />
    </div>
  )
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "green" | "yellow" | "red"
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    success: "bg-success-100 text-success-800",
    warning: "bg-warning-100 text-warning-800",
    danger: "bg-danger-100 text-danger-800",
    info: "bg-sky-100 text-sky-800",
    // Level / availability tones: green = low or available, yellow = medium, red = high or unavailable.
    green: "bg-success-100 text-success-800",
    yellow: "bg-warning-100 text-warning-800",
    red: "bg-danger-100 text-danger-800",
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold capitalize ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function RiskBadge({ risk }: { risk: Risk }) {
  return (
    <Badge
      tone={
        risk === "low" ? "success" : risk === "medium" ? "warning" : "danger"
      }
    >
      {risk} risk
    </Badge>
  )
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const tone =
    status === "checked-in" || status === "completed"
      ? "success"
      : status === "cancelled" || status === "no-show"
        ? "danger"
        : status === "pending"
          ? "warning"
          : "info"
  return <Badge tone={tone}>{status.replace("-", " ")}</Badge>
}

export function StatCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string
  value: string | number
  detail: string
  icon: ReactNode
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 sm:mb-4 flex items-start justify-between">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <span className="grid size-10 place-items-center rounded-xl bg-aqua-50 text-aqua-700">
          {icon}
        </span>
      </div>
      <p className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </Card>
  )
}

type CapacityBarProps = {
  value: number
  max: number
  /** Overrides the computed text label ("3 left" / "Almost full" / "Full"). */
  label?: string
  /** Accessible name for the progressbar. */
  ariaLabel?: string
}

export function CapacityBar({ value, max, label, ariaLabel }: CapacityBarProps) {
  const safeMax = Math.max(1, max)
  const used = Math.max(0, Math.min(value, safeMax))
  const percentage = Math.min(100, Math.round((used / safeMax) * 100))
  const left = Math.max(0, max - value)
  const text =
    label ??
    (percentage >= 100
      ? "Full"
      : percentage >= 90
        ? `Almost full (${left} left)`
        : `${left} left`)
  const color =
    percentage >= 100
      ? "bg-danger-500"
      : percentage >= 70
        ? "bg-warning-500"
        : "bg-success-500"
  const textColor =
    percentage >= 100
      ? "text-danger-700"
      : percentage >= 70
        ? "text-warning-700"
        : "text-success-700"
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={used}
        aria-valuetext={`${used} of ${safeMax}, ${text}`}
        aria-label={ariaLabel ?? `Capacity: ${percentage}% full`}
        className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={`shrink-0 text-xs font-bold ${textColor}`}>{text}</span>
    </div>
  )
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  if (open && (!mounted || closing)) {
    setMounted(true)
    setClosing(false)
  }
  useEffect(() => {
    if (open || !mounted) return
    setClosing(true)
    const t = window.setTimeout(() => {
      setMounted(false)
      setClosing(false)
    }, 150)
    return () => window.clearTimeout(t)
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const items = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    const first = items().find((el) => el.getAttribute("aria-label") !== "Close") ?? items()[0]
    ;(first ?? dialog)?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== "Tab" || !dialog) return
      const list = items()
      if (!list.length) {
        e.preventDefault()
        dialog.focus()
        return
      }
      const firstEl = list[0]
      const lastEl = list[list.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === firstEl || active === dialog)) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault()
        firstEl.focus()
      } else if (!dialog.contains(active)) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
      previous?.focus?.()
    }
  }, [open])

  if (!open && !mounted) return null
  return (
    <div
      className={`${closing ? "modal-backdrop-out pointer-events-none" : "animate-fade"} fixed inset-0 z-50 grid outline-none items-end overflow-hidden bg-ink-950/50 p-0 backdrop-blur-sm sm:place-items-center sm:p-6`}
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <>
        <Card className={`${closing ? "modal-panel-out" : "modal-panel"} max-h-[92dvh] w-full overflow-auto rounded-b-none p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-xl sm:p-8 sm:rounded-2xl`}>
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 id={titleId} className="text-xl font-extrabold text-ink-900">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="grid size-11 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
          {children}
        </Card>
      </>
    </div>
  )
}

export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col justify-between gap-3 sm:mb-7 sm:flex-row sm:items-end">
      <div>
        {eyebrow && (
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-aqua-700">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-950 sm:text-3xl lg:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-slate-200 motion-reduce:animate-none ${className}`} />
}

export function PageSkeleton() {
  return (
    <div role="status" className="min-h-screen bg-sand-50">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-16 rounded-none" />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="mb-6 h-10 w-1/3" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      </div>
    </div>
  )
}
