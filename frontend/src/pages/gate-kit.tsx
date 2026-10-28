import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw, ScanLine, Search, Volume2, VolumeX, XCircle } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Card, Input, StatusBadge } from "../components/ui"
import { useTampisaw } from "../store"
import type { Booking } from "../types"

export type GateKind = "valid" | "warning" | "invalid"

const MUTE_KEY = "tampisaw.gate.mute"

/** Online/offline detection via navigator.onLine and window events. */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener("online", up)
    window.addEventListener("offline", down)
    return () => {
      window.removeEventListener("online", up)
      window.removeEventListener("offline", down)
    }
  }, [])
  return online
}

/** Mute toggle persisted in localStorage. */
export function useGateMute() {
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === "1"
    } catch {
      return false
    }
  })
  const toggle = () =>
    setMuted((m) => {
      try {
        localStorage.setItem(MUTE_KEY, m ? "0" : "1")
      } catch {
        /* storage unavailable */
      }
      return !m
    })
  return { muted, toggle }
}

let audioCtx: AudioContext | null = null
function beep(kind: GateKind) {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    audioCtx = audioCtx ?? new Ctor()
    const ctx = audioCtx
    if (ctx.state === "suspended") void ctx.resume()
    const notes = kind === "valid" ? [880, 1320] : kind === "warning" ? [660, 660] : [220, 160]
    const wave: OscillatorType = kind === "invalid" ? "sawtooth" : "sine"
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const start = ctx.currentTime + i * 0.14
      osc.type = wave
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.2)
    })
  } catch {
    /* audio unavailable */
  }
}

/** Vibrates and beeps for a scan outcome. Sound respects the mute toggle. */
export function gateFeedback(kind: GateKind, muted: boolean) {
  try {
    const pattern = kind === "valid" ? [120] : kind === "warning" ? [100, 80, 100] : [300, 120, 300, 120, 300]
    navigator.vibrate?.(pattern)
  } catch {
    /* vibration unavailable */
  }
  if (!muted) beep(kind)
}

export function MuteToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={muted}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-ink-800 hover:bg-sand-50"
    >
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      {muted ? "Sound off" : "Sound on"}
    </button>
  )
}

/**
 * Banner, pending chip data and auto-sync. Returns what the gate page needs.
 * When the connection returns, pending items are marked synced and `onSynced` fires.
 */
export function useOfflineSync(onSynced: (count: number) => void) {
  const { state, dispatch } = useTampisaw()
  const online = useOnline()
  const pending = state.syncQueue.filter((s) => !s.syncedAt)
  const pendingRef = useRef(pending.length)
  pendingRef.current = pending.length
  const cb = useRef(onSynced)
  cb.current = onSynced
  useEffect(() => {
    if (!online || pendingRef.current === 0) return
    const t = window.setTimeout(() => {
      const n = pendingRef.current
      if (n === 0) return
      dispatch({ type: "SYNC_QUEUE" })
      cb.current(n)
    }, 1200)
    return () => window.clearTimeout(t)
  }, [online, pending.length, dispatch])
  return { online, pending, all: state.syncQueue }
}

export function OfflineBanner() {
  return (
    <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border-2 border-warning-500 bg-warning-100 p-4 text-warning-900">
      <CloudOff size={24} className="mt-0.5 shrink-0" />
      <p className="text-base font-extrabold">Offline — scans are saved on this device and will sync when you're back online.</p>
    </div>
  )
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    setLeaving(false)
    const a = window.setTimeout(() => setLeaving(true), 4350)
    const t = window.setTimeout(onDone, 4500)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(t)
    }
  }, [message, onDone])
  return (
    <div role="status" className={`${leaving ? "animate-slide-out" : "animate-slide-in"} fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-success-700 px-5 py-3 text-sm font-extrabold text-white shadow-lg`}>
      {message}
    </div>
  )
}

export function SyncPanel() {
  const { state } = useTampisaw()
  const [open, setOpen] = useState(false)
  const pending = state.syncQueue.filter((s) => !s.syncedAt)
  const recent = state.syncQueue.slice(0, 10)
  if (state.syncQueue.length === 0) return null
  return (
    <Card className="p-5">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 text-sm font-extrabold text-ink-900">
          <RefreshCw size={16} className="text-aqua-700" /> Offline check-ins
        </span>
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${pending.length ? "bg-warning-100 text-warning-900" : "bg-success-100 text-success-800"}`}>
          {pending.length ? `${pending.length} pending sync` : "All synced"}
        </span>
      </button>
      {open && (
        <ul className="mt-3 space-y-2 text-xs text-slate-600">
          {recent.map((s) => (
            <li key={s.id} className="rounded-lg bg-sand-50 px-3 py-2">
              <span className="block font-extrabold text-ink-900">
                {s.guestName} · {s.bookingId}
              </span>
              Checked in {new Date(s.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} by {s.by} ·{" "}
              {s.syncedAt ? `synced ${new Date(s.syncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "waiting to sync"}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

const tone = {
  valid: { box: "bg-success-600 text-white border-success-800", Icon: CheckCircle2, btn: "bg-white text-success-800 hover:bg-success-50" },
  warning: { box: "bg-warning-400 text-ink-900 border-warning-700", Icon: AlertTriangle, btn: "bg-ink-900 text-white hover:bg-ink-800" },
  invalid: { box: "bg-danger-600 text-white border-danger-800", Icon: XCircle, btn: "bg-white text-danger-800 hover:bg-danger-50" },
} as const

/** Large, high-contrast scan outcome readable in sunlight. */
export function GateResultScreen({
  kind,
  word,
  guestName,
  pax,
  service,
  detail,
  actionLabel,
  onAction,
  onReset,
}: {
  kind: GateKind
  word: string
  guestName?: string
  pax?: number
  service?: string
  detail?: ReactNode
  actionLabel?: string
  onAction?: () => void
  onReset: () => void
}) {
  const t = tone[kind]
  return (
    <section role="status" aria-live="assertive" className={`animate-pop relative overflow-hidden rounded-3xl border-4 p-6 text-center shadow-lg sm:p-10 ${t.box}`}>
      <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${kind === "valid" ? "scan-flash-green" : kind === "invalid" ? "scan-flash-red" : "scan-flash-amber"}`} />
      <t.Icon className="mx-auto" size={96} strokeWidth={2.5} aria-hidden />
      <h2 className="mt-3 text-6xl font-black uppercase tracking-tight sm:text-7xl">{word}</h2>
      {guestName && <p className="mt-4 text-4xl font-extrabold sm:text-5xl">{guestName}</p>}
      {(pax !== undefined || service) && (
        <p className="mt-2 text-3xl font-bold">
          {pax !== undefined && `${pax} ${pax === 1 ? "guest" : "guests"}`}
          {pax !== undefined && service && " · "}
          {service}
        </p>
      )}
      {detail && <div className="mx-auto mt-4 max-w-xl text-xl font-bold">{detail}</div>}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className={`min-h-16 rounded-2xl px-8 text-2xl font-extrabold shadow focus:outline-none focus:ring-4 focus:ring-white/70 ${t.btn}`}
          >
            {actionLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onReset}
          className={`inline-flex min-h-16 items-center justify-center gap-2 rounded-2xl px-8 text-2xl font-extrabold shadow focus:outline-none focus:ring-4 focus:ring-white/70 ${actionLabel ? "border-4 border-current bg-transparent" : t.btn}`}
        >
          <ScanLine size={26} /> Scan next
        </button>
      </div>
    </section>
  )
}

/** Instant manual lookup by name, phone or booking code. */
export function ManualLookup({
  query,
  onQuery,
  results,
  onPick,
  describe,
}: {
  query: string
  onQuery: (q: string) => void
  results: Booking[]
  onPick: (b: Booking) => void
  describe: (b: Booking) => string
}) {
  const ready = query.trim().length >= 2
  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-ink-900">
        <Search size={16} className="text-aqua-700" /> Manual lookup
      </h2>
      <Input label="Name, phone or booking code" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="e.g. Reyes, 0917 or TMP-1054" autoComplete="off" />
      <div className="mt-3" aria-live="polite">
        {!ready ? (
          <p className="text-xs text-slate-500">Type at least 2 characters to see matches.</p>
        ) : results.length === 0 ? (
          <p className="text-sm font-bold text-danger-700">No booking found.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {results.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => onPick(b)} className="flex min-h-14 w-full items-center justify-between gap-3 p-3 text-left hover:bg-aqua-50">
                  <span>
                    <span className="block text-sm font-extrabold text-ink-900">{b.guestName}</span>
                    <span className="text-xs text-slate-500">{describe(b)}</span>
                  </span>
                  <StatusBadge status={b.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
