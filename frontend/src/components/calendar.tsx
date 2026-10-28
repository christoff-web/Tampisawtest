import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

const WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`

/**
 * A compact month calendar for choosing one visit date. Only the dates in `available` can be picked; every other day
 * (past, closed, fully booked) is greyed out and cannot be clicked. The chosen day is filled in and announced.
 */
export function CompactCalendar({
  available,
  value,
  onChange,
  label = "Choose your visit date",
}: {
  available: string[]
  value: string
  onChange: (date: string) => void
  label?: string
}) {
  const open = useMemo(() => new Set(available), [available])
  const first = available[0]
  const last = available[available.length - 1]
  const start = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : (first ?? new Date().toISOString().slice(0, 10))
  const [view, setView] = useState(() => ({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 }))
  const monthName = new Date(view.y, view.m, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" })
  const lead = new Date(view.y, view.m, 1).getDay()
  const days = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const minMonth = first ? Number(first.slice(0, 4)) * 12 + Number(first.slice(5, 7)) - 1 : view.y * 12 + view.m
  const maxMonth = last ? Number(last.slice(0, 4)) * 12 + Number(last.slice(5, 7)) - 1 : view.y * 12 + view.m
  const cur = view.y * 12 + view.m
  const go = (delta: number) => {
    const n = cur + delta
    setView({ y: Math.floor(n / 12), m: n % 12 })
  }
  const today = new Date().toISOString().slice(0, 10)

  if (!available.length)
    return <p role="status" className="rounded-xl bg-warning-50 p-3 text-sm font-semibold text-warning-900">No dates are open for booking right now. Please check again soon.</p>

  return (
    <div className="w-full max-w-[19rem] rounded-2xl border border-slate-200 bg-white p-3" role="group" aria-label={label}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" disabled={cur <= minMonth} onClick={() => go(-1)} className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30">
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-extrabold" aria-live="polite">{monthName}</p>
        <button type="button" aria-label="Next month" disabled={cur >= maxMonth} onClick={() => go(1)} className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK.map((w) => (
          <span key={w} className="pb-1 text-[11px] font-bold uppercase text-slate-400">{w}</span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`b${i}`} />
          const key = iso(view.y, view.m, d)
          const can = open.has(key)
          const on = key === value
          return (
            <button
              key={key}
              type="button"
              disabled={!can}
              aria-pressed={on}
              aria-label={new Date(`${key}T12:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) + (can ? "" : ", not available")}
              onClick={() => onChange(key)}
              className={`grid h-9 place-items-center rounded-lg text-sm font-semibold ${
                on
                  ? "bg-aqua-600 text-white ring-2 ring-aqua-200"
                  : can
                    ? `text-ink-900 hover:bg-aqua-50 ${key === today ? "ring-1 ring-aqua-300" : ""}`
                    : "cursor-not-allowed text-slate-300 line-through decoration-slate-200"
              }`}
            >
              {d}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500" role="status">
        {value && open.has(value)
          ? `Selected: ${new Date(`${value}T12:00:00`).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`
          : "Pick a highlighted date. Past, closed and full days are greyed out."}
      </p>
    </div>
  )
}
