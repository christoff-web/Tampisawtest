import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CalendarRange,
  Check,
  CircleCheck,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Percent,
  Receipt,
  Save,
  Settings2,
  Sun,
  TrendingUp,
  UserX,
  Users,
} from "lucide-react"
import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AdminLayout } from "../components/layouts"
import { ConfirmDialog, useConfirm } from "../components/confirm"
import { useLeaveGuard } from "../components/leave-guard"
import {
  Badge,
  Button,
  Card,
  Input,
  PageTitle,
  RiskBadge,
  Select,
  StatCard,
} from "../components/ui"
import {
  peso,
  prettyDate,
  prettyDateTime,
  riskFactors,
  riskLevel,
  riskScoreOf,
  slotLabels,
  slotStart,
} from "../lib/rules"
import { useTampisaw } from "../store"
import type { Booking, RiskRules, Settings } from "../types"

/* ------------------------------------------------------------------ */
/* shared helpers                                                      */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, "0")
const ymd = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (iso: string) => new Date(`${iso}T12:00:00`)
const addDays = (iso: string, n: number) => {
  const d = parse(iso)
  d.setDate(d.getDate() + n)
  return ymd(d)
}
const isTuesday = (iso: string) => parse(iso).getDay() === 2
const shortDay = (iso: string) =>
  parse(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
const weekday = (iso: string) =>
  parse(iso).toLocaleDateString("en-PH", { weekday: "short" })

const ATTENDED = ["checked-in", "checked-out", "completed"]
const ACTIVE = ["pending", "reserved", "confirmed"]

function FlowNote({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "danger" | "success"
  title?: string
  children: ReactNode
}) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warning: "border-warning-200 bg-warning-50 text-warning-900",
    danger: "border-danger-200 bg-danger-50 text-danger-900",
    success: "border-success-200 bg-success-50 text-success-900",
  }
  const Icon =
    tone === "success" ? CircleCheck : tone === "info" ? Info : AlertTriangle
  return (
    <div
      className={`flex gap-3 rounded-2xl border p-4 text-sm leading-6 ${tones[tone]}`}
    >
      <Icon size={18} className="mt-1 shrink-0" />
      <div>
        {title && <p className="font-extrabold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  )
}

function SectionHead({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
      <div>
        <h2 className="text-lg font-extrabold text-ink-900">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

function YesNo({
  value,
  onChange,
  label,
}: {
  value: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-bold text-ink-800">{label}</span>
      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={`min-h-9 rounded-lg px-4 text-sm font-bold transition ${
              value === v
                ? "bg-white text-aqua-800 shadow-sm"
                : "text-slate-500 hover:text-ink-800"
            }`}
          >
            {v ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </div>
  )
}

function BackToDashboard() {
  return (
    <Link
      to="/admin"
      className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-aqua-800 hover:bg-aqua-50"
    >
      <ArrowLeft size={16} /> Return to dashboard
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/* 1. FORECAST                                                         */
/* ------------------------------------------------------------------ */


type HistoryDay = { date: string; visitors: number }
type Level = "Low" | "Moderate" | "High"

export function ForecastPage({ admin }: { admin?: boolean } = {}) {
  void admin
  const { state, dispatch, currentUser } = useTampisaw()
  const [windowDays, setWindowDays] = useState(7)
  const [changeWindow, setChangeWindow] = useState(false)
  const { ask, dialog } = useConfirm()
  const today = ymd(new Date())

  const dailyCap = useMemo(
    () =>
      state.slots
        .filter(
          (s) => s.active && (s.id === "day-tour" || s.id === "night-swim"),
        )
        .reduce((sum, s) => sum + s.capacity, 0) || 220,
    [state.slots],
  )

  const history = useMemo<HistoryDay[]>(() => {
    const real = new Map<string, number>()
    state.bookings
      .filter((b) => ATTENDED.includes(b.status))
      .forEach((b) => real.set(b.date, (real.get(b.date) ?? 0) + b.guests))
    const out: HistoryDay[] = []
    for (let i = 30; i >= 1; i--) {
      const date = addDays(today, -i)
      if (isTuesday(date)) continue
      if (real.has(date)) out.push({ date, visitors: real.get(date)! })
    }
    return out
  }, [state.bookings, today])

  const available = history.length
  const enough = available >= windowDays
  const effective = Math.min(windowDays, available)

  const level = (v: number): Level => {
    const pct = v / dailyCap
    return pct >= 0.65 ? "High" : pct >= 0.4 ? "Moderate" : "Low"
  }

  const forecast = useMemo(() => {
    if (!available) return []
    const vals = history.map((h) => h.visitors)
    const out: { date: string; visitors: number | null }[] = []
    for (let i = 1; i <= 7; i++) {
      const date = addDays(today, i)
      if (isTuesday(date)) {
        out.push({ date, visitors: null })
        continue
      }
      const slice = vals.slice(-effective)
      const v = Math.round(slice.reduce((a, b) => a + b, 0) / slice.length)
      vals.push(v)
      out.push({ date, visitors: v })
    }
    return out
  }, [history, available, effective, today])

  const open = forecast.filter((f) => f.visitors !== null) as {
    date: string
    visitors: number
  }[]
  const nextOpen = open[0]
  const total7 = open.reduce((s, f) => s + f.visitors, 0)
  const peak = open.reduce<(typeof open)[number] | undefined>(
    (best, f) => (!best || f.visitors > best.visitors ? f : best),
    undefined,
  )
  const highDays = open.filter((f) => level(f.visitors) === "High")

  const chartData = useMemo(() => {
    const tail = history.slice(-21)
    const rows: {
      label: string
      actual?: number
      sma?: number
      forecast?: number
    }[] = tail.map((h) => {
      const idx = history.indexOf(h)
      const prev = history.slice(Math.max(0, idx - windowDays), idx)
      return {
        label: shortDay(h.date),
        actual: h.visitors,
        sma: prev.length
          ? Math.round(prev.reduce((s, p) => s + p.visitors, 0) / prev.length)
          : undefined,
      }
    })
    if (rows.length && open.length)
      rows[rows.length - 1].forecast = rows[rows.length - 1].actual
    open.forEach((f) =>
      rows.push({ label: shortDay(f.date), forecast: f.visitors }),
    )
    return rows
  }, [history, open, windowDays])

  const levelTone = (l: Level) =>
    l === "High" ? "red" : l === "Moderate" ? "yellow" : "green"

  const peakOn = () =>
    ask({
      title: "Turn Peak season ON?",
      body: `Peak season changes from OFF to ON. Peak hold timers (cottage ${state.settings.hold.peak.cottageHours} h, pool ${state.settings.hold.peak.poolHours} h instead of ${state.settings.hold.regular.cottageHours} h and ${state.settings.hold.regular.poolHours} h) apply to all new bookings immediately.`,
      confirmLabel: "Turn Peak season ON",
      run: () =>
        dispatch({
          type: "SAVE_SETTINGS",
          settings: { ...state.settings, peakSeason: true },
          by: currentUser?.name ?? "Admin",
        }),
    })

  return (
    <AdminLayout>
      <PageTitle
        eyebrow="Forecast"
        title="Expected visitors"
        description="A simple moving average (SMA) of past daily visitor counts, online and walk-in, projects the days ahead. The resort is closed on Tuesdays, so those days are skipped."
      />

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-extrabold text-ink-900">
            Loaded history
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {available} open day{available === 1 ? "" : "s"} of visitor counts
            (checked-in guests from online and walk-in bookings).
          </p>
        </Card>
        <Card className="p-5">
          <YesNo
            label="Change SMA window?"
            value={changeWindow}
            onChange={setChangeWindow}
          />
          <div className="mt-3">
            {changeWindow ? (
              <Select
                label="Window length"
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
              >
                <option value={3}>3-day average</option>
                <option value={7}>7-day average (default)</option>
                <option value={14}>14-day average</option>
              </Select>
            ) : (
              <p className="text-sm text-slate-500">
                Using the default {windowDays}-day window.
              </p>
            )}
          </div>
        </Card>
      </div>

      {!available ? (
        <FlowNote tone="warning" title="Not enough data to forecast">
          There are no past visitor counts yet. The forecast appears once guests have been checked in.
        </FlowNote>
      ) : (
        <>
          {!enough && (
            <div className="mb-5">
              <FlowNote tone="warning" title="Limited data">
                Only {available} past day{available === 1 ? "" : "s"} available
                for a {windowDays}-day window. The forecast uses the available{" "}
                {effective} day{effective === 1 ? "" : "s"} and is less
                reliable.
              </FlowNote>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label={
                nextOpen && nextOpen.date === addDays(today, 1)
                  ? "Tomorrow"
                  : "Next open day"
              }
              value={nextOpen ? `${nextOpen.visitors} guests` : "-"}
              detail={nextOpen ? prettyDate(nextOpen.date) : "No open day"}
              icon={<Sun size={20} />}
            />
            <StatCard
              label="Next 7 days"
              value={`${total7} guests`}
              detail={`${open.length} open days, avg ${open.length ? Math.round(total7 / open.length) : 0} per day`}
              icon={<Users size={20} />}
            />
            <StatCard
              label="Peak day"
              value={peak ? `${peak.visitors} guests` : "-"}
              detail={
                peak
                  ? `${prettyDate(peak.date)} · ${level(peak.visitors)} crowd`
                  : "No data"
              }
              icon={<TrendingUp size={20} />}
            />
          </div>

          <Card className="mt-6 overflow-hidden">
            <SectionHead
              title="Actual vs SMA forecast"
              hint={`${effective}-day moving average. The shaded area is the forecast period.`}
            />
            <div className="h-80 p-4" role="img" aria-label="Actual visitors versus SMA forecast chart">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#dde3ee" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={14} />
                  <YAxis tick={{ fontSize: 11 }} width={36} />
                  <Tooltip />
                  <Legend />
                  {open.length > 0 && (
                    <ReferenceArea
                      x1={shortDay(open[0].date)}
                      x2={shortDay(open[open.length - 1].date)}
                      fill="#1e5bd8"
                      fillOpacity={0.1}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual visitors"
                    stroke="#0a1f44"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="sma"
                    name={`SMA (${windowDays}d)`}
                    stroke="#1e5bd8"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    name="Forecast"
                    stroke="#d9480f"
                    strokeWidth={3}
                    strokeDasharray="6 4"
                    dot={{ r: 3 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="mt-6 overflow-hidden">
            <SectionHead
              title="Next 5 days"
              hint={`Daily capacity ${dailyCap} pool guests. Low under 40%, Moderate 40-64%, High 65% and above.`}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Expected visitors</th>
                    <th className="px-5 py-3">Share of capacity</th>
                    <th className="px-5 py-3">Crowd level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {forecast.slice(0, 5).map((f) => (
                    <tr key={f.date}>
                      <td className="px-5 py-3 font-bold">{prettyDate(f.date)}</td>
                      {f.visitors === null ? (
                        <td colSpan={3} className="px-5 py-3 text-slate-500">
                          Closed (Tuesday disinfection day)
                        </td>
                      ) : (
                        <>
                          <td className="px-5 py-3">{f.visitors}</td>
                          <td className="px-5 py-3">
                            {Math.round((f.visitors / dailyCap) * 100)}%
                          </td>
                          <td className="px-5 py-3">
                            <Badge tone={levelTone(level(f.visitors))}>
                              {level(f.visitors)}
                            </Badge>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="mt-6">
            {highDays.length > 0 ? (
              <Card className="border-warning-300 bg-warning-50 p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-1 shrink-0 text-warning-700" size={20} />
                  <div className="flex-1">
                    <h2 className="text-lg font-extrabold text-warning-950">
                      High crowd ahead: {highDays.map((d) => `${weekday(d.date)} ${shortDay(d.date)}`).join(", ")}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-warning-900">
                      Plan staff, slots and cottages for the peak day. Switch on
                      the Peak hold timer in Booking Rules so unpaid holds
                      release faster.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link to="/admin/rules-policies">
                        <Button variant="secondary">
                          <Settings2 size={16} /> Open Booking Rules
                        </Button>
                      </Link>
                      <Button onClick={peakOn} disabled={state.settings.peakSeason}>
                        <Sun size={16} />
                        {state.settings.peakSeason
                          ? "Peak season is ON"
                          : "Turn Peak season ON"}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ) : (
              <FlowNote tone="success" title="No High-crowd day ahead">
                Expected crowds stay below 65% of daily capacity for the next 7
                days. No action needed.
              </FlowNote>
            )}
          </div>
        </>
      )}
      {dialog}
      <BackToDashboard />
    </AdminLayout>
  )
}

/* ------------------------------------------------------------------ */
/* 2. NO-SHOW RISK                                                     */
/* ------------------------------------------------------------------ */

const ruleFields: { key: keyof RiskRules; label: string; hint: string }[] = [
  { key: "previousNoShow", label: "Previous no-show", hint: "points per past no-show" },
  { key: "previousCancellation", label: "Past cancellation", hint: "points per past cancellation" },
  { key: "lateBooking", label: "Booked under 3 days ahead", hint: "points" },
  { key: "noConfirmation", label: "No confirmation / deposit", hint: "points" },
  { key: "largeGroup", label: "Group of 10 or more", hint: "points" },
]

export function NoShowRiskPage({ admin }: { admin?: boolean } = {}) {
  void admin
  const { state, dispatch, currentUser } = useTampisaw()
  const rules = state.settings.riskRules
  const by = currentUser?.name ?? "Admin"
  const { ask, dialog } = useConfirm()
  const [adjust, setAdjust] = useState(false)
  const [draft, setDraft] = useState<Record<keyof RiskRules, string>>(() =>
    Object.fromEntries(
      Object.entries(rules).map(([k, v]) => [k, String(v)]),
    ) as Record<keyof RiskRules, string>,
  )
  const [saved, setSaved] = useState(false)
  const [scope, setScope] = useState<"today" | "upcoming">("today")
  const [noShowTarget, setNoShowTarget] = useState<Booking | null>(null)
  const today = ymd(new Date())
  const now = Date.now()

  const rows = useMemo(
    () =>
      state.bookings
        .filter((b) => b.source !== "walk-in" && ACTIVE.includes(b.status))
        .map((b) => {
          const guest = state.guests.find((g) => g.id === b.guestId)
          const factors = riskFactors(b, guest, rules, state.settings.confirmationHours)
          const score = riskScoreOf(b, guest, rules, state.settings.confirmationHours)
          return {
            b,
            guest,
            factors,
            score,
            level: riskLevel(score, rules),
            passed: slotStart(b).getTime() <= now,
          }
        })
        .sort((a, b) => b.score - a.score),
    [state.bookings, state.guests, state.settings.confirmationHours, rules, now],
  )

  const upcoming = rows.filter((r) => !r.passed)
  const scoped = scope === "today" ? upcoming.filter((r) => r.b.date === today) : upcoming
  const count = (l: string) => scoped.filter((r) => r.level === l).length
  const followUp = upcoming.filter((r) => r.level !== "low")
  const passed = rows.filter((r) => r.passed)

  const nums = Object.fromEntries(
    Object.entries(draft).map(([k, v]) => [k, Number(v)]),
  ) as Record<keyof RiskRules, number>
  const error = Object.values(draft).some(
    (v) => v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 100,
  )
    ? "Every value must be a number from 0 to 100."
    : nums.mediumFrom >= nums.highFrom
      ? "The Medium threshold must be lower than the High threshold."
      : ""

  const save = () => {
    if (error) return
    const changed = (Object.keys(nums) as (keyof RiskRules)[])
      .filter((k) => nums[k] !== rules[k])
      .map((k) => `${k}: ${rules[k]} to ${nums[k]}`)
    ask({
      title: "Save risk rule policy?",
      body: `${changed.length ? `Changes: ${changed.join("; ")}.` : "No values changed."} Risk levels for all upcoming bookings are re-scored with the new thresholds.`,
      confirmLabel: "Save rule policy",
      run: () => {
        dispatch({
          type: "SAVE_SETTINGS",
          settings: { ...state.settings, riskRules: nums },
          by,
        })
        setSaved(true)
        setAdjust(false)
      },
    })
  }

  const reasons = (r: (typeof rows)[number]) =>
    r.factors.length ? (
      <div className="flex flex-wrap gap-1.5">
        {r.factors.map((f) => (
          <span
            key={f.label}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
          >
            {f.label} +{f.points}
          </span>
        ))}
      </div>
    ) : (
      <span className="text-xs text-slate-400">No risk factors</span>
    )

  return (
    <AdminLayout>
      <PageTitle
        eyebrow="No-show risk"
        title="Scoring and follow-up"
        description="Rule-based scores help you follow up with online guests who may not show up. Walk-in bookings are excluded."
      />

      <Card className="overflow-hidden">
        <SectionHead
          title="Scoring rules"
          hint="Each online booking adds points for the rules it matches."
          action={
            <YesNo label="Adjust rule policy?" value={adjust} onChange={(v) => { setAdjust(v); setSaved(false) }} />
          }
        />
        <div className="p-5">
          {adjust ? (
            <div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...ruleFields, { key: "mediumFrom" as const, label: "Medium risk from", hint: "score" }, { key: "highFrom" as const, label: "High risk from", hint: "score" }].map((f) => (
                  <Input
                    key={f.key}
                    label={`${f.label} (${f.hint})`}
                    type="number"
                    min={0}
                    max={100}
                    inputMode="numeric"
                    value={draft[f.key]}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  />
                ))}
              </div>
              {error && (
                <p className="mt-3 text-sm font-bold text-danger-600" role="alert">
                  {error}
                </p>
              )}
              <div className="mt-4 flex gap-3">
                <Button onClick={save} disabled={!!error}>
                  <Save size={16} /> Save rule policy
                </Button>
                <Button variant="ghost" onClick={() => setAdjust(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {ruleFields.map((f) => (
                  <div key={f.key} className="rounded-xl bg-sand-50 p-4 ring-1 ring-slate-200/70">
                    <p className="text-2xl font-extrabold text-ink-900">+{rules[f.key]}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600">{f.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <Badge tone="success">Low 0-{rules.mediumFrom - 1}</Badge>
                <Badge tone="warning">Medium {rules.mediumFrom}-{rules.highFrom - 1}</Badge>
                <Badge tone="danger">High {rules.highFrom}+</Badge>
              </div>
              {saved && (
                <p className="mt-3 text-sm font-bold text-success-700">
                  Rule policy saved and logged. Scores below are recalculated.
                </p>
              )}
            </>
          )}
        </div>
      </Card>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">Bookings by risk</h2>
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          {(["today", "upcoming"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              aria-pressed={scope === s}
              className={`min-h-9 rounded-lg px-4 text-sm font-bold capitalize ${scope === s ? "bg-white text-aqua-800 shadow-sm" : "text-slate-500"}`}
            >
              {s === "today" ? "Today" : "All upcoming"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        {(["low", "medium", "high"] as const).map((l) => (
          <Card key={l} className="p-5">
            <RiskBadge risk={l} />
            <p className="mt-3 text-4xl font-extrabold text-ink-900">{count(l)}</p>
            <p className="text-xs text-slate-500">
              online booking{count(l) === 1 ? "" : "s"} {scope === "today" ? "today" : "upcoming"}
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        {followUp.length === 0 ? (
          <FlowNote tone="success" title="Low risk: no follow-up needed">
            No upcoming online booking is Medium or High risk.
          </FlowNote>
        ) : (
          <Card className="overflow-hidden">
            <SectionHead
              title="Follow-up list"
              hint="Medium and High risk guests. Send a reminder; they stay here until they confirm attendance."
              action={<Badge tone="warning">{followUp.length} guest{followUp.length === 1 ? "" : "s"}</Badge>}
            />
            <div className="divide-y divide-slate-100">
              {followUp.map((r) => {
                const sentHrs = r.b.reminderSentAt
                  ? (now - new Date(r.b.reminderSentAt).getTime()) / 3_600_000
                  : null
                return (
                  <div key={r.b.id} className="grid gap-3 p-5 lg:grid-cols-[1.1fr_1.4fr_1.2fr] lg:items-start">
                    <div>
                      <p className="font-extrabold">{r.b.guestName}</p>
                      <p className="text-sm text-slate-500">
                        {prettyDate(r.b.date)} · {slotLabels[r.b.slotId] ?? r.b.slotId}
                      </p>
                      <p className="text-xs text-slate-400">{r.b.id} · {r.b.guests} guests</p>
                      <div className="mt-2 flex items-center gap-2">
                        <RiskBadge risk={r.level} />
                        <span className="text-xs font-bold text-slate-500">{r.score} pts</span>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">Risk reasons</p>
                      {reasons(r)}
                    </div>
                    <div className="grid gap-2">
                      <Button
                        variant={sentHrs === null ? "primary" : "secondary"}
                        onClick={() =>
                          ask({
                            title: sentHrs === null ? "Send reminder?" : "Resend reminder?",
                            body: `An email reminder will be sent to ${r.b.guestName} for booking ${r.b.id} on ${prettyDate(r.b.date)}. It cannot be recalled once sent.`,
                            confirmLabel: sentHrs === null ? "Send reminder" : "Resend reminder",
                            run: () => dispatch({ type: "SEND_REMINDER", id: r.b.id, by }),
                          })
                        }
                      >
                        <BellRing size={16} /> {sentHrs === null ? "Send reminder" : "Resend reminder"}
                      </Button>
                      <p className="text-xs leading-5 text-slate-500">
                        {sentHrs === null
                          ? "No reminder sent. Guest stays on the follow-up list."
                          : sentHrs < 24
                            ? `Reminder sent ${Math.max(0, Math.floor(sentHrs))}h ago. Guest stays on the list until they confirm or cancel in My Bookings.`
                            : "No confirmation after 24h. Allow the slot as check-in; if the guest does not arrive it moves to history as a no-show."}
                      </p>
                      {sentHrs !== null && sentHrs >= 24 && <Badge tone="danger">24h passed, unconfirmed</Badge>}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </div>

      <Card className="mt-6 overflow-hidden">
        <SectionHead
          title="Slot passed: no-show path"
          hint="Unconfirmed online bookings whose slot time has passed without check-in can be moved to history as a no-show (more than 0 hours late)."
        />
        {passed.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            No booking is waiting for a no-show decision. The button below
            unlocks only after the slot time has passed.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {passed.map((r) => (
              <div key={r.b.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <p className="font-extrabold">{r.b.guestName}</p>
                  <p className="text-sm text-slate-500">{prettyDate(r.b.date)} · {slotLabels[r.b.slotId] ?? r.b.slotId}</p>
                  {(r.guest?.noShows ?? 0) > 0 && (
                    <Badge tone="danger">Repeat no-show: deposit required</Badge>
                  )}
                </div>
                <Button variant="danger" onClick={() => setNoShowTarget(r.b)}>
                  <UserX size={16} /> Move to history as no-show
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-slate-100 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
          Repeat no-shows must pay a deposit on future bookings and are tracked
          in Reports. Marking a no-show changes only the booking status.
        </div>
      </Card>
      <ConfirmDialog
        open={!!noShowTarget}
        danger
        title="Move this booking to history as a no-show?"
        confirmLabel="Mark as no-show"
        onCancel={() => setNoShowTarget(null)}
        onConfirm={() => {
          if (noShowTarget) dispatch({ type: "MARK_NO_SHOW", id: noShowTarget.id })
          setNoShowTarget(null)
        }}
      >
        {noShowTarget?.guestName} ({noShowTarget?.id}) will be recorded as a no-show. This counts against their guest record and future bookings may require a deposit.
      </ConfirmDialog>
      {dialog}
      <BackToDashboard />
    </AdminLayout>
  )
}

/* ------------------------------------------------------------------ */
/* 3. REPORTS                                                          */
/* ------------------------------------------------------------------ */

export function ReportsFlowPage({ admin }: { admin?: boolean } = {}) {
  void admin
  const { state } = useTampisaw()
  const now = new Date()
  const [from, setFrom] = useState(ymd(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
  const [exporting, setExporting] = useState(false)
  const [format, setFormat] = useState<"excel" | "pdf">("excel")
  const [done, setDone] = useState("")

  const validRange = !!from && !!to && from <= to

  const data = useMemo(() => {
    if (!validRange) return null
    const inRange = (d: string) => d >= from && d <= to
    const bookings = state.bookings.filter((b) => inRange(b.date))
    const refunds = state.refunds.filter((r) => inRange(r.at.slice(0, 10)))
    if (!bookings.length && !refunds.length) return null
    const attended = bookings.filter((b) => ATTENDED.includes(b.status))
    const visitors = attended.reduce((s, b) => s + b.guests, 0)
    const online = attended.filter((b) => b.source !== "walk-in").reduce((s, b) => s + b.guests, 0)
    const noShows = bookings.filter((b) => b.status === "no-show").length
    const denom = attended.length + noShows
    const gross = bookings
      .filter((b) => !["expired"].includes(b.status))
      .reduce((s, b) => s + b.paid, 0)
    const refunded = refunds.filter((r) => r.kind === "refund").reduce((s, r) => s + r.amount, 0)
    const deposits = refunds.filter((r) => r.kind === "deposit-kept")
    const depositTotal = deposits.reduce((s, r) => s + r.amount, 0)
    const weeks: { week: string; online: number; walkIn: number }[] = []
    const days = Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000) + 1
    for (let i = 0; i < Math.ceil(days / 7); i++) {
      const s = addDays(from, i * 7)
      const e = addDays(from, Math.min(i * 7 + 6, days - 1))
      const wk = attended.filter((b) => b.date >= s && b.date <= e)
      weeks.push({
        week: `${shortDay(s)}-${shortDay(e)}`,
        online: wk.filter((b) => b.source !== "walk-in").reduce((a, b) => a + b.guests, 0),
        walkIn: wk.filter((b) => b.source === "walk-in").reduce((a, b) => a + b.guests, 0),
      })
    }
    const summary: [string, number][] = [
      ["Fully paid bookings", bookings.filter((b) => b.total > 0 && b.paid >= b.total).length],
      ["Appointments (pool)", bookings.filter((b) => b.type === "pool").length],
      ["Cottage / room / event", bookings.filter((b) => b.type !== "pool").length],
      ["Day tour", bookings.filter((b) => b.slotId === "day-tour").length],
      ["Night swimming", bookings.filter((b) => b.slotId === "night-swim").length],
      ["Cancelled", bookings.filter((b) => b.status === "cancelled").length],
      ["Refunds issued", refunds.filter((r) => r.kind === "refund").length],
      ["Deposits kept", deposits.length],
    ]
    return {
      bookings, refunds, visitors, online, noShows,
      rate: denom ? (noShows / denom) * 100 : 0,
      gross, refunded, depositTotal,
      revenue: gross - refunded, weeks, summary,
    }
  }, [state.bookings, state.refunds, from, to, validRange])

  const rows = (): (string | number)[][] =>
    !data
      ? []
      : [
          ["Tampisaw report - Golden Pyramid Swimming Pool"],
          ["Period", from, to],
          [],
          ["KPI", "Value"],
          ["Total visitors", data.visitors],
          ["Online visitors", data.online],
          ["Walk-in visitors", data.visitors - data.online],
          ["Bookings", data.bookings.length],
          ["No-shows", data.noShows],
          ["No-show rate (%)", data.rate.toFixed(1)],
          ["Payments collected (PHP)", data.gross],
          ["Refunds (PHP)", data.refunded],
          ["Deposits kept (PHP)", data.depositTotal],
          ["Net revenue (PHP)", data.revenue],
          [],
          ["Visitors per week", "Online", "Walk-in"],
          ...data.weeks.map((w) => [w.week, w.online, w.walkIn]),
          [],
          ["Booking summary", "Count"],
          ...data.summary.map(([k, v]) => [k, v]),
          [],
          ["Refund / deposit ID", "Date", "Booking", "Guest", "Kind", "Amount (PHP)", "Reason", "By"],
          ...data.refunds.map((r) => [r.id, r.at.slice(0, 10), r.bookingId, r.guestName, r.kind, r.amount, r.reason, r.by]),
        ]

  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportFile = async () => {
    const name = `tampisaw-report-${from}-to-${to}`
    if (format === "excel") {
      const csv = rows()
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\r\n")
      download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${name}.csv`)
      setDone("Excel-compatible file downloaded (.csv).")
    } else {
      const { jsPDF } = await import("jspdf")
      const doc = new jsPDF()
      let y = 18
      doc.setFontSize(16)
      doc.text("Tampisaw report - Golden Pyramid Swimming Pool", 14, y)
      doc.setFontSize(10)
      rows().slice(1).forEach((r) => {
        y += r.length ? 6 : 3
        if (y > 280) { doc.addPage(); y = 18 }
        if (r.length) doc.text(r.map(String).join("   |   ").slice(0, 110), 14, y)
      })
      doc.save(`${name}.pdf`)
      setDone("PDF file downloaded.")
    }
  }


  return (
    <AdminLayout>
      <PageTitle
        eyebrow="Reports"
        title="Visitors, bookings and revenue"
        description="Review visitors, bookings and no-shows for any period, then export if needed."
      />

      <Card className="p-5">
        <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
          <Input label="From" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setDone("") }} />
          <Input label="To" type="date" value={to} onChange={(e) => { setTo(e.target.value); setDone("") }} />
          <div className="flex gap-2">
            {[
              ["This month", () => { setFrom(ymd(new Date(now.getFullYear(), now.getMonth(), 1))); setTo(ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0))) }],
              ["Last 90 days", () => { setFrom(addDays(ymd(now), -90)); setTo(ymd(now)) }],
            ].map(([label, fn]) => (
              <Button key={label as string} variant="secondary" onClick={fn as () => void}>
                <CalendarRange size={16} /> {label as string}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {!validRange ? (
        <div className="mt-6">
          <FlowNote tone="danger" title="Invalid date range">
            Choose a start date that is on or before the end date.
          </FlowNote>
        </div>
      ) : !data ? (
        <div className="mt-6">
          <FlowNote tone="warning" title="No data for this period">
            No bookings, refunds or deposits fall between {prettyDate(from)} and {prettyDate(to)}. Choose another range.
          </FlowNote>
        </div>
      ) : (
        <div id="report-print">
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total visitors" value={data.visitors} detail={`${data.online} online, ${data.visitors - data.online} walk-in`} icon={<Users size={20} />} />
            <StatCard label="Bookings" value={data.bookings.length} detail={`${data.summary[5][1]} cancelled`} icon={<Receipt size={20} />} />
            <StatCard label="No-show rate" value={`${data.rate.toFixed(1)}%`} detail={`${data.noShows} no-show${data.noShows === 1 ? "" : "s"}`} icon={<Percent size={20} />} />
            <StatCard label="Revenue" value={peso(data.revenue)} detail={`${peso(data.gross)} collected, ${peso(data.refunded)} refunded`} icon={<TrendingUp size={20} />} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card className="overflow-hidden">
              <SectionHead title="Visitors per week" hint="Checked-in guests, online and walk-in." />
              <div className="h-72 p-4" role="img" aria-label="Visitors per week bar chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.weeks}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#dde3ee" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={36} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="online" name="Online" stackId="v" fill="#1e5bd8" />
                    <Bar dataKey="walkIn" name="Walk-in" stackId="v" fill="#d9480f" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="overflow-hidden">
              <SectionHead title="Booking summary" />
              <dl className="divide-y divide-slate-100">
                {data.summary.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-5 py-3 text-sm">
                    <dt className="text-slate-600">{k}</dt>
                    <dd className="font-extrabold">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          <Card className="mt-6 overflow-hidden">
            <SectionHead
              title="Refunds and deposits"
              hint={`Refunded ${peso(data.refunded)} · Deposits kept ${peso(data.depositTotal)}. Admin review of refunds and deposits.`}
            />
            {data.refunds.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">No refunds or deposits in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">When</th>
                      <th className="px-5 py-3">Booking</th>
                      <th className="px-5 py-3">Guest</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Amount</th>
                      <th className="px-5 py-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.refunds.map((r) => (
                      <tr key={r.id}>
                        <td className="px-5 py-3">{prettyDateTime(r.at)}</td>
                        <td className="px-5 py-3 font-bold">{r.bookingId}</td>
                        <td className="px-5 py-3">{r.guestName}</td>
                        <td className="px-5 py-3">
                          <Badge tone={r.kind === "refund" ? "info" : "warning"}>
                            {r.kind === "refund" ? "Refund" : "Deposit kept"}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 font-bold">{peso(r.amount)}</td>
                        <td className="px-5 py-3 text-slate-600">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="mt-6 p-5 print:hidden">
            <YesNo label="Export report?" value={exporting} onChange={(v) => { setExporting(v); setDone("") }} />
            {!exporting ? (
              <p className="mt-3 text-sm text-slate-500">Viewing on screen only.</p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <Select label="Export format" value={format} onChange={(e) => { setFormat(e.target.value as "excel" | "pdf"); setDone("") }}>
                  <option value="excel">Excel (.csv)</option>
                  <option value="pdf">PDF</option>
                </Select>
                <Button onClick={exportFile}>
                  {format === "excel" ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
                  <Download size={16} /> Generate and download
                </Button>
              </div>
            )}
            {done && (
              <p className="mt-3 flex items-center gap-2 text-sm font-bold text-success-700" role="status">
                <Check size={16} /> {done}
              </p>
            )}
          </Card>
        </div>
      )}
      <BackToDashboard />
    </AdminLayout>
  )
}

/* ------------------------------------------------------------------ */
/* 4. BOOKING RULES                                                    */
/* ------------------------------------------------------------------ */

type RulesForm = {
  peakSeason: boolean
  regCottage: string
  regPool: string
  peakCottage: string
  peakPool: string
  payMin: string
  confirmHrs: string
  cancelHrs: string
  downPct: string
}

const toForm = (s: Settings): RulesForm => ({
  peakSeason: s.peakSeason,
  regCottage: String(s.hold.regular.cottageHours),
  regPool: String(s.hold.regular.poolHours),
  peakCottage: String(s.hold.peak.cottageHours),
  peakPool: String(s.hold.peak.poolHours),
  payMin: String(s.onlinePaymentMinutes),
  confirmHrs: String(s.confirmationHours),
  cancelHrs: String(s.cancellationHours),
  downPct: String(s.downpaymentPct),
})

type DiffEntry = { at: string; by: string; changes: string[] }

export function BookingRulesPage({ admin }: { admin?: boolean } = {}) {
  void admin
  const { state, dispatch, currentUser } = useTampisaw()
  const { ask, dialog } = useConfirm()
  const [form, setForm] = useState<RulesForm>(() => toForm(state.settings))
  const [errors, setErrors] = useState<Partial<Record<keyof RulesForm, string>>>({})
  const [saved, setSaved] = useState(false)
  const { dialog: leaveDialog } = useLeaveGuard(JSON.stringify(form) !== JSON.stringify(toForm(state.settings)), "Leaving now will discard your unsaved changes.")
  // History of rule changes comes from the audit log in the database (each save records what changed).
  const diffs: DiffEntry[] = state.auditLog
    .filter((a) => a.action.startsWith("Booking rules saved") && a.action.includes(" Changes: "))
    .slice(0, 20)
    .map((a) => ({
      at: a.at,
      by: a.actor,
      changes: a.action.slice(a.action.indexOf(" Changes: ") + 10).replace(/\.$/, "").split("; "),
    }))

  const set = (k: keyof RulesForm, v: string | boolean) => {
    setForm({ ...form, [k]: v })
    setSaved(false)
  }

  const validate = () => {
    const e: Partial<Record<keyof RulesForm, string>> = {}
    const pos = (k: keyof RulesForm) => {
      const n = Number(form[k])
      if (String(form[k]).trim() === "" || !Number.isFinite(n) || n <= 0)
        e[k] = "Enter a number greater than 0."
      return n
    }
    const rc = pos("regCottage"), rp = pos("regPool"), pc = pos("peakCottage"), pp = pos("peakPool")
    pos("payMin"); pos("confirmHrs"); pos("cancelHrs")
    const pct = pos("downPct")
    if (!e.peakCottage && pc > rc) e.peakCottage = "Peak hold cannot be longer than Regular."
    if (!e.peakPool && pp > rp) e.peakPool = "Peak hold cannot be longer than Regular."
    if (!e.downPct && (pct < 1 || pct > 100)) e.downPct = "Downpayment must be 1 to 100%."
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const save = () => {
    if (!validate()) {
      setSaved(false)
      return
    }
    const old = state.settings
    const next: Settings = {
      ...old,
      peakSeason: form.peakSeason,
      hold: {
        regular: { cottageHours: Number(form.regCottage), poolHours: Number(form.regPool) },
        peak: { cottageHours: Number(form.peakCottage), poolHours: Number(form.peakPool) },
      },
      onlinePaymentMinutes: Number(form.payMin),
      confirmationHours: Number(form.confirmHrs),
      cancellationHours: Number(form.cancelHrs),
      downpaymentPct: Number(form.downPct),
    }
    const pairs: [string, string | number, string | number][] = [
      ["Peak season", old.peakSeason ? "ON" : "OFF", next.peakSeason ? "ON" : "OFF"],
      ["Regular cottage hold (h)", old.hold.regular.cottageHours, next.hold.regular.cottageHours],
      ["Regular pool hold (h)", old.hold.regular.poolHours, next.hold.regular.poolHours],
      ["Peak cottage hold (h)", old.hold.peak.cottageHours, next.hold.peak.cottageHours],
      ["Peak pool hold (h)", old.hold.peak.poolHours, next.hold.peak.poolHours],
      ["Online payment window (min)", old.onlinePaymentMinutes, next.onlinePaymentMinutes],
      ["Confirmation deadline (h)", old.confirmationHours, next.confirmationHours],
      ["Cancellation cutoff (h)", old.cancellationHours, next.cancellationHours],
      ["Downpayment (%)", old.downpaymentPct, next.downpaymentPct],
    ]
    const changes = pairs.filter(([, a, b]) => a !== b).map(([k, a, b]) => `${k}: ${a} to ${b}`)
    const by = currentUser?.name ?? "Admin"
    ask({
      title: "Save booking rules?",
      body: `${changes.length ? `Changes: ${changes.join("; ")}.` : "No values changed."} The new rules apply to all new bookings immediately.`,
      confirmLabel: "Save settings",
      run: () => {
        dispatch({ type: "SAVE_SETTINGS", settings: next, by, detail: changes.join("; ") })
        setSaved(true)
      },
    })
  }

  const log = state.auditLog.filter((a) => a.action.startsWith("Booking rules saved"))

  const num = (label: string, k: keyof RulesForm, suffix?: string) => (
    <Input
      label={suffix ? `${label} (${suffix})` : label}
      type="number"
      min={1}
      inputMode="numeric"
      value={form[k] as string}
      error={errors[k]}
      onChange={(e) => set(k, e.target.value)}
    />
  )

  return (
    <AdminLayout>
      {leaveDialog}
      <PageTitle
        eyebrow="Booking rules"
        title="Hold timers and booking policy"
        description="Hold, confirmation and cancellation rules that apply to online reservations."
      />

      {Object.keys(errors).length > 0 && (
        <div className="mb-5" role="alert">
          <FlowNote tone="danger" title="Validation error">
            Fix the highlighted fields. Values must be positive numbers, Peak holds cannot exceed Regular holds, and the downpayment must be 1 to 100%.
          </FlowNote>
        </div>
      )}
      {saved && (
        <div className="mb-5" role="status">
          <FlowNote tone="success" title="Settings saved and logged">
            New bookings use these values. Existing bookings keep the rules they were made under. The Peak hold timer applies immediately.
          </FlowNote>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-6">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-extrabold">
                  <Sun size={18} className="text-warning-500" /> Peak season
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  When ON, new bookings use the Peak hold times below instead of Regular.
                </p>
              </div>
              <button
                role="switch"
                aria-checked={form.peakSeason}
                aria-label="Peak season"
                onClick={() => set("peakSeason", !form.peakSeason)}
                className={`relative h-8 w-14 shrink-0 rounded-full transition ${form.peakSeason ? "bg-warning-500" : "bg-slate-300"}`}
              >
                <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-all ${form.peakSeason ? "left-7" : "left-1"}`} />
              </button>
            </div>
            <p className="mt-3 text-sm font-bold">
              Currently saved: {state.settings.peakSeason ? "ON (Peak timers active)" : "OFF (Regular timers)"}
            </p>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-5">
              <h2 className="text-lg font-extrabold">Regular hold timer</h2>
              <div className="mt-4 grid gap-4">
                {num("Cottage hold", "regCottage", "hours")}
                {num("Pool appointment hold", "regPool", "hours")}
              </div>
            </Card>
            <Card className={`p-5 ${form.peakSeason ? "ring-2 ring-warning-300" : ""}`}>
              <h2 className="text-lg font-extrabold">Peak hold timer</h2>
              <div className="mt-4 grid gap-4">
                {num("Cottage hold", "peakCottage", "hours")}
                {num("Pool appointment hold", "peakPool", "hours")}
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="text-lg font-extrabold">Payment, confirmation and cancellation</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {num("Online payment window", "payMin", "minutes")}
              {num("Attendance confirmation deadline", "confirmHrs", "hours before slot")}
              {num("Cancellation cutoff", "cancelHrs", "hours before slot")}
              {num("Cottage downpayment", "downPct", "%")}
            </div>
            <p className="mt-4 rounded-xl bg-sand-50 p-3 text-sm text-slate-600 ring-1 ring-slate-200/70">
              Refund availability: refunds and deposits are available 3 to 5 business days after approval.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={save}>
                <Save size={16} /> Save settings
              </Button>
              <Button variant="ghost" onClick={() => { setForm(toForm(state.settings)); setErrors({}); setSaved(false) }}>
                Reset to saved
              </Button>
            </div>
          </Card>
        </div>

        <Card className="h-fit p-5">
          <h2 className="text-lg font-extrabold">How these rules work</h2>
          <ul className="mt-3 grid gap-3 text-sm leading-6 text-slate-600">
            {[
              "The hold timer starts when a booking status is Pending.",
              "Peak season ON uses the Peak hold times; OFF uses Regular.",
              "A visit within 24 hours gets a shortened 1-hour hold, or payment is required before the slot.",
              "Pool paid before the hold ends: Confirmed. Cottage downpayment paid: Reserved and the timer stops. Otherwise: Expired and the slot is released.",
              "Guests confirm attendance before the deadline. Bookings made closer than that have no confirmation window.",
              "No confirmation after follow-up: the booking is cancelled, the payment is recorded as a deposit and the slot is released.",
              "Cancellations inside the cutoff are not refundable and the payment is kept as a deposit.",
              "Saved changes apply to new bookings only. The Peak hold timer applies immediately.",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <Check size={16} className="mt-1 shrink-0 text-aqua-600" /> {t}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <SectionHead title="Change log" hint="Who changed the booking rules, when, and what changed." />
        {log.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No changes saved yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {log.map((a) => (
              <li key={a.id} className="p-5 text-sm">
                <p className="font-bold">{a.actor} <span className="font-normal text-slate-400">· {prettyDateTime(a.at)}</span></p>
                <p className="mt-1 text-slate-600">{a.action}</p>
              </li>
            ))}
          </ul>
        )}
        {diffs.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50 p-5">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">Old to new values (this browser)</p>
            <ul className="grid gap-3 text-sm">
              {diffs.map((d) => (
                <li key={d.at}>
                  <span className="font-bold">{d.by}</span> <span className="text-slate-400">· {prettyDateTime(d.at)}</span>
                  <p className="text-slate-600">{d.changes.length ? d.changes.join("; ") : "No values changed"}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      {dialog}
      <BackToDashboard />
    </AdminLayout>
  )
}

