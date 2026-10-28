import { waitingCount } from "../lib/waitlist"
import { ProofViewer } from "../components/proof"
import { readProof } from "../lib/proof"
import { ImageInput } from "../components/image-input"
import { RescheduleButton } from "../components/reschedule"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  AlertTriangle,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  Home,
  Palmtree,
  Droplets,
  LifeBuoy,
  Search,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { AdminLayout } from "../components/layouts"
import {
  Badge,
  Button,
  CapacityBar,
  Card,
  Input,
  Modal,
  PageTitle,
  RiskBadge,
  Select,
  StatCard,
  StatusBadge,
} from "../components/ui"
import { ConfirmDialog, useConfirm } from "../components/confirm"
import { useLeaveGuard } from "../components/leave-guard"
import { useTampisaw } from "../store"
import { isWithinCutoff, riskLevel, riskScoreOf } from "../lib/rules"
import {
  arrivalLabel,
  canAccess,
  durationCapFor,
  guardsNeeded,
  poolLogStatus,
  poolRange,
  roleLabel,
  routeAccess,
  isAdminRole,
  paymentOptionLabel,
  paymentProgress,
} from "../lib/ops"
import { matchesGuest, SEARCH_PLACEHOLDER } from "../lib/search"
import type { Blackout, Booking, BookingStatus, Cottage, Policy, Role, Slot } from "../types"

const peso = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount)
const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  })

const pad = (value: number) => String(value).padStart(2, "0")
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`)
  value.setDate(value.getDate() + days)
  return dateKey(value)
}
const dayName = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-PH", { weekday: "long" })
const forecastDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" })

const ATTENDED_STATUSES: BookingStatus[] = ["checked-in", "checked-out", "completed"]
const FORECAST_STATUSES: BookingStatus[] = ["reserved", "confirmed", ...ATTENDED_STATUSES]
const BOOKING_STATUS_OPTIONS: { value: BookingStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "reserved", label: "Reserved" },
  { value: "confirmed", label: "Confirmed" },
  { value: "checked-in", label: "Checked in" },
  { value: "checked-out", label: "Checked out" },
  { value: "completed", label: "Completed" },
  { value: "cancellation-requested", label: "Cancellation requested" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
  { value: "no-show", label: "No-show" },
]

export function AdminDashboard() {
  const { state, todayBookings, headcount, currentUser } = useTampisaw()
  const today = dateKey(new Date())
  const previousWeek = shiftDate(today, -7)
  const greeting = (() => {
    const hour = new Date().getHours()
    return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  })()
  const firstName = currentUser?.name?.split(" ")[0] || "there"
  const scoreOf = (b: Booking) =>
    riskScoreOf(b, state.guests.find((g) => g.id === b.guestId), state.settings.riskRules, state.settings.confirmationHours)
  const highRisk = state.bookings.filter(
    (booking) =>
      booking.risk === "high" &&
      ["pending", "confirmed"].includes(booking.status),
  ).length
  const available = state.cottages.filter(
    (cottage) => cottage.status === "available",
  ).length
  const maintenance = state.cottages.filter((cottage) => cottage.status === "maintenance").length
  const previousWeekBookings = state.bookings.filter((booking) => booking.date === previousWeek).length
  const bookingChange = previousWeekBookings
    ? Math.round(((todayBookings.length - previousWeekBookings) / previousWeekBookings) * 100)
    : null
  const activeCottageBookings = new Set(
    state.bookings
      .filter((booking) => ["pending", "reserved", "confirmed", "checked-in"].includes(booking.status))
      .map((booking) => booking.cottageId)
      .filter((id): id is string => !!id),
  )
  const unbookedAvailable = state.cottages.filter(
    (cottage) => cottage.status === "available" && !activeCottageBookings.has(cottage.id),
  ).length
  const forecastData = useMemo(() => {
    const counts = new Map<string, number>()
    state.bookings
      .filter((booking) => FORECAST_STATUSES.includes(booking.status))
      .forEach((booking) => counts.set(booking.date, (counts.get(booking.date) ?? 0) + booking.guests))
    const historical = Array.from(counts.keys()).filter((date) => date <= today)
    if (!historical.length) return []
    const averageForWeekday = (date: string) => {
      const weekday = new Date(`${date}T12:00:00`).getDay()
      const values = historical
        .filter((item) => new Date(`${item}T12:00:00`).getDay() === weekday)
        .sort()
        .slice(-4)
        .map((item) => counts.get(item) ?? 0)
      const fallback = historical.slice(-4).map((item) => counts.get(item) ?? 0)
      const sample = values.length ? values : fallback
      return sample.length ? Math.round(sample.reduce((sum, value) => sum + value, 0) / sample.length) : 0
    }
    return Array.from({ length: 15 }, (_, index) => {
      const date = shiftDate(today, index - 7)
      return {
        day: forecastDay(date),
        actual: counts.get(date) ?? null,
        forecast: averageForWeekday(date),
      }
    })
  }, [state.bookings, today])
  const futureForecast = forecastData.slice(-7)
  const peakForecast = futureForecast.reduce(
    (peak, item) => (!peak || item.forecast > peak.forecast ? item : peak),
    undefined as (typeof futureForecast)[number] | undefined,
  )
  const dailyCapacity = state.slots
    .filter((slot) => slot.active && (slot.id === "day-tour" || slot.id === "night-swim"))
    .reduce((sum, slot) => sum + slot.capacity, 0)
  const suggestedStaff = peakForecast ? Math.max(1, Math.ceil(peakForecast.forecast / 30)) : 0
  const loadLabel = peakForecast && dailyCapacity && peakForecast.forecast / dailyCapacity >= 0.65 ? "High load" : "Moderate load"
  const insightDay = peakForecast ? dayName(shiftDate(today, futureForecast.indexOf(peakForecast) + 1)) : "the busiest day"
  const insightAverage = peakForecast?.forecast ?? 0
  const payments = state.bookings.filter(
    (booking) => booking.paymentStatus === "submitted",
  )
  const activeRiskBookings = state.bookings
    .filter((booking) => ["pending", "confirmed"].includes(booking.status))
    .filter((booking) => booking.source !== "walk-in")
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, 4)
  return (
    <AdminLayout>
      <PageTitle
        eyebrow="Operations overview"
        title={`${greeting}, ${firstName}`}
        description="Here’s how Golden Pyramid is looking today."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today’s bookings"
          value={todayBookings.length}
          detail={bookingChange === null ? `No bookings ${shortDate(previousWeek)}` : `${bookingChange >= 0 ? "+" : ""}${bookingChange}% from ${shortDate(previousWeek)}`}
          icon={<ClipboardList size={20} />}
        />
        <StatCard
          label="Current guest count"
          value={headcount}
          detail={`${todayBookings.reduce((s, b) => s + b.guests, 0)} expected today`}
          icon={<Users size={20} />}
        />
        <StatCard
          label="Available cottages"
          value={`${available}/${state.cottages.length}`}
          detail={`${maintenance} under maintenance`}
          icon={<Palmtree size={20} />}
        />
        <StatCard
          label="High-risk bookings"
          value={highRisk}
          detail="Needs confirmation follow-up"
          icon={<AlertTriangle size={20} />}
        />
      </div>
      <Card className="mt-6 border-warning-200 bg-warning-50 p-5">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-warning-100 text-warning-700">
            <AlertTriangle size={21} />
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-extrabold">Action needed</h2>
            <div className="mt-3 grid gap-2 text-sm font-semibold sm:grid-cols-3">
              <p>{payments.length} payments to verify</p>
              <p>{highRisk} high-risk bookings today</p>
              <p>{unbookedAvailable} cottages without an active booking</p>
            </div>
          </div>
        </div>
      </Card>
      <SafetyCoverageTile />
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
        <Card className="p-5 sm:p-6">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h2 className="text-lg font-extrabold">
                Expected guest forecast
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                SMA method: average of the last 4 same weekdays · actual vs
                forecast
              </p>
            </div>
            <Badge tone="info">
              <TrendingUp size={13} className="mr-1" /> {peakForecast ? `Peak on ${insightDay}` : "Forecast unavailable"}
            </Badge>
          </div>
          <div className="h-72 w-full">
            {forecastData.length === 0 ? (
              <div className="grid h-full place-items-center rounded-xl bg-slate-50 text-center">
                <div>
                  <ChartNoAxesCombined className="mx-auto text-slate-300" />
                  <p className="mt-3 font-bold">Data insufficient</p>
                  <p className="mt-1 text-xs text-slate-500">
                    At least four weeks of attendance are needed.
                  </p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecastData} margin={{ left: -24, right: 8 }}>
                  <defs>
                    <linearGradient id="aquaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="#1e5bd8"
                        stopOpacity={0.28}
                      />
                      <stop offset="95%" stopColor="#1e5bd8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#dde3ee"
                  />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#5b6a85", fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#5b6a85", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, borderColor: "#dde3ee" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="forecast"
                    stroke="#1e5bd8"
                    strokeWidth={3}
                    fill="url(#aquaFill)"
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#0a1f44"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-aqua-50 p-4 text-sm">
              <span>
                <strong>Staffing suggestion:</strong> Expected peak of {peakForecast?.forecast ?? 0} guests
              </span>
              <Badge tone="info">{suggestedStaff ? `Suggest ${suggestedStaff} staff` : "No suggestion"}</Badge>
          </div>
        </Card>
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-extrabold">Today by slot</h2>
          <p className="mt-1 text-xs text-slate-500">
            Confirmed guest capacity
          </p>
          <div className="mt-6 grid gap-6">
            {state.slots.map((slot) => {
              const booked = todayBookings
                .filter((b) => b.slotId === slot.id)
                .reduce((s, b) => s + b.guests, 0)
              return (
                <div key={slot.id}>
                  <div className="mb-2 flex items-end justify-between">
                    <div>
                      <p className="text-sm font-bold">{slot.label}</p>
                      <p className="text-xs text-slate-400">{slot.time}</p>
                    </div>
                    <p className="text-sm font-extrabold">
                      {booked}/{slot.capacity}
                    </p>
                  </div>
                  <CapacityBar value={booked} max={slot.capacity} />
                </div>
              )
            })}
          </div>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.5fr]">
        <Card className="border-sky-200 bg-sky-50 p-5 sm:p-6">
          <p className="text-xs font-extrabold uppercase tracking-wider text-sky-700">
            SMA attendance insight
          </p>
          <p className="mt-3 text-3xl font-extrabold text-ink-950">
            {insightAverage} guests
          </p>
          <p className="mt-1 text-sm font-bold text-warning-700">
            {loadLabel} · schedule {suggestedStaff} additional staff
          </p>
          <p className="mt-5 text-sm leading-6 text-slate-600">
            {insightDay} averages {insightAverage} expected attendees across the latest comparable
            bookings. Cottage demand is projected from active reservations.
          </p>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b p-5 sm:px-6">
            <p className="text-lg font-extrabold">No-show risk scoring</p>
            <p className="mt-1 text-xs text-slate-500">
              Rule-based score from guest history, payment, and booking status
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-bold">Guest</th>
                  <th className="px-5 py-3 font-bold">Reservation</th>
                  <th className="px-5 py-3 font-bold">Deposit</th>
                  <th className="px-5 py-3 font-bold">Risk score</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeRiskBookings.map((booking) => (
                  <tr key={booking.id}>
                    <td className="px-5 py-4">
                      <p className="font-extrabold">{booking.guestName}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {booking.id}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-semibold capitalize text-slate-600">
                      {booking.type}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold">{peso(booking.paid)}</p>
                      <p className="mt-0.5 text-xs capitalize text-slate-400">
                        {booking.paymentStatus}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <RiskBadge risk={riskLevel(scoreOf(booking), state.settings.riskRules)} />
                        <span className="text-xs font-bold text-slate-500">
                          {scoreOf(booking)} pts
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card className="mt-6 overflow-hidden">
        <div className="border-b p-5">
          <h2 className="text-lg font-extrabold">Recent bookings</h2>
        </div>
        <BookingRows bookings={state.bookings.slice(0, 5)} />
      </Card>
    </AdminLayout>
  )
}

function SafetyCoverageTile() {
  const { state } = useTampisaw()
  const latest = [...state.poolLogs].sort((a, b) => b.at.localeCompare(a.at))[0]
  const water = latest ? poolLogStatus(latest.ph, latest.chlorine) : null
  return (
    <Card className="mt-6 p-5 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold">Pool water quality</h2>
          <p className="mt-1 text-xs text-slate-500">Latest pH and chlorine reading.</p>
        </div>
        <Badge tone={water === "out-of-range" ? "warning" : "success"}>
          {water === "out-of-range" ? "Needs attention" : "On track"}
        </Badge>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-sky-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Droplets size={17} className="text-sky-700" /> Latest water reading
          </p>
          {latest ? (
            <>
              <p className="mt-2 text-sm">
                pH <b>{latest.ph}</b> (safe {poolRange.ph[0]}–{poolRange.ph[1]}) · Chlorine{" "}
                <b>{latest.chlorine} ppm</b> (safe {poolRange.chlorine[0]}–{poolRange.chlorine[1]})
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Logged {new Date(latest.at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} by {latest.by}
              </p>
              <div className="mt-2">
                <Badge tone={water === "ok" ? "success" : "danger"}>
                  {water === "ok" ? "In range" : "Out of range"}
                </Badge>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No pool log has been recorded yet.</p>
          )}
        </div>
      </div>
    </Card>
  )
}

function BookingRows({ bookings }: { bookings: Booking[] }) {
  return (
    <div className="divide-y">
      {bookings.map((booking) => (
        <div
          key={booking.id}
          className="grid gap-3 p-4 sm:grid-cols-[1fr_0.8fr_0.6fr_0.5fr] sm:items-center"
        >
          <div>
            <p className="font-bold">{booking.guestName}</p>
            <p className="text-xs text-slate-400">{booking.id}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">{shortDate(booking.date)}</p>
            <p className="text-xs capitalize text-slate-400">
              {booking.slotId}
            </p>
          </div>
          <StatusBadge status={booking.status} />
          <RiskBadge risk={booking.risk} />
        </div>
      ))}
    </div>
  )
}

export function BookingsAdmin() {
  const { state, dispatch, currentUser } = useTampisaw()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [risk, setRisk] = useState("all")
  const [source, setSource] = useState("all")
  const [selected, setSelected] = useState<Booking | null>(null)
  const [rejecting, setRejecting] = useState<Booking | null>(null)
  const { ask, dialog } = useConfirm()
  const [picked, setPicked] = useState<string[]>([])
  const [messaging, setMessaging] = useState(false)
  const [draft, setDraft] = useState("")
  const phoneOf = (b: Booking) =>
    b.phone ?? state.guests.find((g) => g.id === b.guestId)?.phone
  const filtered = state.bookings.filter(
    (b) =>
      matchesGuest(query, {
        id: b.id,
        name: b.guestName,
        email: b.email,
        phone: phoneOf(b),
      }) &&
      (status === "archived" ? !!b.archived : !b.archived && (status === "all" || b.status === status)) &&
      (risk === "all" || b.risk === risk) &&
      (source === "all" || (b.source ?? "online") === source),
  )
  const pendingPayments = state.bookings.filter(
    (booking) => booking.paymentStatus === "submitted",
  )
  const pageIds = filtered.map((b) => b.id)
  const chosen = state.bookings.filter((b) => picked.includes(b.id))
  const allPicked = pageIds.length > 0 && pageIds.every((id) => picked.includes(id))
  const toggleAll = () => setPicked(allPicked ? picked.filter((id) => !pageIds.includes(id)) : Array.from(new Set([...picked, ...pageIds])))
  const toggleOne = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
  const csvCell = (v: unknown) => {
    let t = String(v ?? "")
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const exportChosen = () => {
    const csv = [
      ["Booking", "Guest", "Phone", "Email", "Date", "Guests", "Type", "Status", "Payment", "Paid", "Total"],
      ...chosen.map((b) => [b.id, b.guestName, phoneOf(b) ?? "", b.email, b.date, b.guests, b.type, b.status, b.paymentStatus, b.paid, b.total]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "tampisaw-selected-bookings.csv"
    link.click()
    URL.revokeObjectURL(url)
    setPicked([])
  }
  const CANCELLABLE = ["pending", "reserved", "confirmed", "cancellation-requested"]
  const cancelChosen = () => {
    const todo = chosen.filter((b) => CANCELLABLE.includes(b.status))
    const skipped = chosen.length - todo.length
    if (!todo.length) {
      ask({ title: "Nothing to cancel", body: "None of the selected bookings can be cancelled. Only upcoming, unfinished bookings can be.", confirmLabel: "OK", cancelLabel: "Close", run: () => {} })
      return
    }
    ask({
      title: `Cancel ${todo.length} booking${todo.length === 1 ? "" : "s"}?`,
      body: `Each guest is notified. Bookings inside the ${state.settings.cancellationHours}-hour cutoff keep their payment as a deposit; the rest are refunded in full.${skipped ? ` ${skipped} selected booking${skipped === 1 ? " is" : "s are"} already closed and will be skipped.` : ""}`,
      confirmLabel: `Cancel ${todo.length} booking${todo.length === 1 ? "" : "s"}`,
      cancelLabel: "Keep bookings",
      danger: true,
      run: () => {
        todo.forEach((b) =>
          dispatch({ type: "PROCESS_CANCEL", id: b.id, by: currentUser?.name ?? "Admin", eligible: isWithinCutoff(b, state.settings), amount: b.paid }),
        )
        setPicked([])
      },
    })
  }
  const exportBookings = () => {
    const csv = [
      "Booking,Guest,Date,Guests,Status,Payment,Risk",
      ...state.bookings.map(
        (booking) =>
          `${booking.id},${booking.guestName},${booking.date},${booking.guests},${booking.status},${booking.paymentStatus},${booking.risk}`,
      ),
    ].join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "tampisaw-bookings.csv"
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <AdminLayout>
      <PageTitle
        eyebrow="Reservations"
        title="Booking management"
        description="Search, filter, and review every pool and cottage reservation."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={exportBookings}>
              <Download size={16} /> CSV
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              PDF / Print
            </Button>
          </div>
        }
      />
      <Card className="mb-5 overflow-hidden border-warning-200">
        <div className="border-b bg-warning-50 p-4">
          <h2 className="font-extrabold">Payment verification queue</h2>
          <p className="mt-1 text-xs text-slate-500">
            {pendingPayments.length} proof uploads need review
          </p>
        </div>
        {pendingPayments.map((booking) => (
          <div
            key={booking.id}
            className="flex flex-col gap-3 border-b p-4 last:border-0 sm:flex-row sm:items-center"
          >
            <div className="flex-1">
              <p className="font-bold">
                {booking.guestName} · {booking.id}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {booking.paymentMethod?.toUpperCase()} · {booking.proofName} ·{" "}
                {peso(booking.paid)}
              </p>
              {arrivalLabel(booking) && (
                <p className="mt-1 text-xs font-semibold text-aqua-800">
                  Arrival: {arrivalLabel(booking)}
                </p>
              )}
              {booking.staffApproval && (
                <p className="mt-1 text-xs font-semibold text-warning-700">
                  Proof checked by {booking.staffApproval.by}. Confirm in your own bank or GCash that the money arrived.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <ProofViewer name={booking.proofName} image={booking.proofImage} method={booking.paymentMethod === "cash" ? "Cash" : "QR payment"} amount={booking.dueNow ?? booking.total} />
              <Button variant="secondary" onClick={() => setRejecting(booking)}>
                Reject
              </Button>
              <Button
                onClick={() =>
                  ask({
                    title: "Confirm the money was received?",
                    body: `${booking.id} (${booking.guestName}): ${peso(booking.dueNow ?? booking.paid)} via ${booking.paymentMethod?.toUpperCase()} (${booking.proofName}). Only continue if you checked your own bank or GCash account and the money is really there. The booking is then confirmed and cannot be undone.`,
                    confirmLabel: "Yes, payment received",
                    run: () =>
                      dispatch({
                        type: "VERIFY_PAYMENT",
                        id: booking.id,
                        approved: true,
                        by: currentUser?.name,
                        byRole: "admin",
                      }),
                  })
                }
              >
                <Check size={16} /> Approve
              </Button>
            </div>
          </div>
        ))}
        {!pendingPayments.length && (
          <p className="p-5 text-sm text-slate-500">
            All payment proofs have been reviewed.
          </p>
        )}
      </Card>
      <Card className="mb-5 grid gap-4 p-4 md:grid-cols-[1fr_180px_160px_160px_auto] md:items-end">
        <Input
          label="Search"
          placeholder={SEARCH_PLACEHOLDER}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          {BOOKING_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          <option value="archived">Archived (recently deleted)</option>
        </Select>
        <Select
          label="No-show risk"
          value={risk}
          onChange={(e) => setRisk(e.target.value)}
        >
          <option value="all">All risk levels</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </Select>
        <Select label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="all">Online and walk-in</option>
          <option value="online">Online</option>
          <option value="walk-in">Walk-in</option>
        </Select>
        <Button
          variant="ghost"
          onClick={() => {
            setQuery("")
            setStatus("all")
            setRisk("all")
            setSource("all")
          }}
        >
          Reset
        </Button>
      </Card>
      <Card className="overflow-hidden">
        <label className="flex items-center gap-3 border-b bg-white px-5 py-3 text-sm font-bold text-slate-600">
          <input type="checkbox" checked={allPicked} onChange={toggleAll} disabled={!pageIds.length} className="size-5 accent-aqua-600" />
          Select all {pageIds.length} on this page
        </label>
        <div className="hidden grid-cols-[0.8fr_1.2fr_1fr_0.7fr_0.7fr_48px] border-b bg-slate-50 px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-slate-500 lg:grid">
          <span>Booking</span>
          <span>Guest</span>
          <span>Schedule</span>
          <span>Status</span>
          <span>Risk</span>
          <span />
        </div>
        {filtered.map((booking) => (
          <div
            key={booking.id}
            className="grid gap-3 border-b p-5 last:border-0 lg:grid-cols-[0.8fr_1.2fr_1fr_0.7fr_0.7fr_48px] lg:items-center"
          >
            <label className="flex items-center gap-3 text-sm font-extrabold">
              <input
                type="checkbox"
                checked={picked.includes(booking.id)}
                onChange={() => toggleOne(booking.id)}
                aria-label={`Select ${booking.id}`}
                className="size-5 accent-aqua-600"
              />
              {booking.id}
            </label>
            <div>
              <p className="text-sm font-bold">{booking.guestName}</p>
              <p className="text-xs text-slate-400">
                {booking.guests} guests · {booking.type} · {phoneOf(booking) || "no contact"}
              </p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${booking.source === "walk-in" ? "bg-warning-100 text-warning-800" : "bg-sky-100 text-sky-800"}`}>
                {booking.source === "walk-in" ? "Walk-in" : "Online"}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold">{shortDate(booking.date)}</p>
              <p className="text-xs capitalize text-slate-400">
                {booking.slotId}
              </p>
            </div>
            <StatusBadge status={booking.status} />
            <RiskBadge risk={booking.risk} />
            <button
              onClick={() => setSelected(booking)}
              className="grid size-10 place-items-center rounded-xl border hover:bg-slate-50"
              aria-label="View booking"
            >
              <Eye size={17} />
            </button>
          </div>
        ))}
        {!filtered.length && (
          <div className="p-12 text-center">
            <Search className="mx-auto text-slate-300" />
            <p className="mt-3 font-bold">No matching bookings</p>
            <p className="mt-1 text-sm text-slate-400">
              Try changing your filters.
            </p>
          </div>
        )}
      </Card>
      {dialog}
      <ConfirmDialog
        open={!!rejecting}
        danger
        title="Reject this payment proof?"
        confirmLabel="Reject proof"
        onCancel={() => setRejecting(null)}
        onConfirm={() => {
          if (rejecting)
            dispatch({
              type: "VERIFY_PAYMENT",
              id: rejecting.id,
              approved: false,
              by: currentUser?.name,
            })
          setRejecting(null)
        }}
      >
        The proof for {rejecting?.id} ({rejecting?.guestName}) will be marked
        rejected and the guest will be asked to upload a new one.
      </ConfirmDialog>
      <Modal
        open={!!selected}
        title={selected?.id || "Booking details"}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="grid gap-4">
            <BookingArchiveControls booking={selected} onDone={() => setSelected(null)} />
            <div className="rounded-xl bg-sand-100 p-4">
              <p className="text-xs font-bold text-slate-500">Guest</p>
              <p className="mt-1 font-extrabold">{selected.guestName}</p>
              <p className="text-sm text-slate-500">
                {selected.email}
                {phoneOf(selected) ? ` · ${phoneOf(selected)}` : ""}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-400">Schedule</p>
                <p className="font-bold">
                  {shortDate(selected.date)} · {selected.slotId}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Party</p>
                <p className="font-bold">{selected.guests} guests</p>
              </div>
              <div>
                <p className="text-slate-400">Payment</p>
                <p className="font-bold">
                  {peso(selected.paid)} / {peso(selected.total)}
                </p>
                <p className="text-xs text-slate-500">{paymentOptionLabel(selected.paymentOption)} · {paymentProgress(selected)}</p>
              </div>
              {selected.cancelReason && (
                <div className="col-span-2">
                  <p className="text-slate-400">Cancellation reason</p>
                  <p className="font-bold">{selected.cancelReason}</p>
                </div>
              )}
              <div>
                <p className="text-slate-400">Risk</p>
                <RiskBadge risk={selected.risk} />
              </div>
            </div>
            {(selected.proofName || selected.balanceProof) && (
              <div className="flex flex-wrap gap-2">
                {selected.proofName && <ProofViewer name={selected.proofName} image={selected.proofImage} label="View payment proof" method={selected.paymentMethod === "cash" ? "Cash" : "QR payment"} amount={selected.dueNow ?? selected.total} />}
                {selected.balanceProof && <ProofViewer name={selected.balanceProof.name} image={selected.balanceProof.image} label="View balance proof" />}
              </div>
            )}
            <RescheduleButton booking={selected} actor={currentUser?.name ?? "Admin"} onDone={() => setSelected(null)} />
            <Button onClick={() => setSelected(null)}>Done</Button>
          </div>
        )}
      </Modal>
      <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3 shadow-lg" role="region" aria-label="Bulk actions">
        <p className="mr-auto px-2 text-sm font-bold" aria-live="polite">
          {picked.length ? `${picked.length} selected` : "No bookings selected"}
        </p>
        <Button variant="secondary" disabled={!picked.length} onClick={() => setMessaging(true)}>
          Send message
        </Button>
        <Button variant="secondary" disabled={!picked.length} onClick={exportChosen}>
          <Download size={16} /> Export CSV
        </Button>
        <Button variant="danger" disabled={!picked.length} onClick={cancelChosen}>
          Cancel
        </Button>
        <Button variant="ghost" disabled={!picked.length} onClick={() => setPicked([])}>
          Clear
        </Button>
      </div>
      <Modal open={messaging} title={`Message ${picked.length} guest${picked.length === 1 ? "" : "s"}`} onClose={() => setMessaging(false)}>
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-ink-800">
            Message
            <textarea
              rows={5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write the message guests will see in their notifications"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base font-normal outline-none transition focus:border-aqua-500 focus:ring-4 focus:ring-aqua-100"
            />
          </label>
          <Button
            disabled={!draft.trim()}
            onClick={() => {
              dispatch({ type: "BULK_NOTIFY", ids: picked, message: draft.trim(), by: currentUser?.name ?? "Admin" })
              setMessaging(false)
              setDraft("")
              setPicked([])
            }}
          >
            Send to {picked.length} guest{picked.length === 1 ? "" : "s"}
          </Button>
        </div>
      </Modal>
    </AdminLayout>
  )
}

const INACTIVE_STATUSES = ["cancelled", "no-show", "expired"]
const todayIso = () => new Date().toISOString().slice(0, 10)

const TIER_COPY: Record<string, { title: string; unit: string }> = {
  "day-tour": { title: "Day Swimming", unit: "Day tier head-count limit" },
  "night-swim": { title: "Night Swimming", unit: "Night tier head-count limit" },
  "room-stay": { title: "Overnight (22-hour room stay)", unit: "Overnight head-count limit" },
}

export function CapacityAdmin() {
  const { state, dispatch, currentUser } = useTampisaw()
  const [editing, setEditing] = useState<Slot | null>(null)
  const { dialog: leaveDialog } = useLeaveGuard(!!editing, "Leaving now will discard your unsaved changes.")
  const [date, setDate] = useState(todayIso)
  const [closureDate, setClosureDate] = useState("")
  const [closureSlot, setClosureSlot] = useState("")
  const [closureReason, setClosureReason] = useState("")
  const [removing, setRemoving] = useState<Blackout | null>(null)
  const { ask, dialog } = useConfirm()
  const occupancy = (slotId: string) =>
    state.bookings
      .filter(
        (b) =>
          b.date === date &&
          b.slotId === slotId &&
          !INACTIVE_STATUSES.includes(b.status),
      )
      .reduce((s, b) => s + b.guests, 0)
  const editingOccupied = editing ? occupancy(editing.id) : 0
  const capError = !editing
    ? ""
    : !Number.isInteger(editing.capacity) || editing.capacity < 1
      ? "Enter a whole number of at least 1."
      : editing.capacity < editingOccupied
        ? `Cannot go below the ${editingOccupied} guests already booked on ${shortDate(date)}.`
        : ""
  const tiers = state.slots.filter((slot) => TIER_COPY[slot.id])
  const others = state.slots.filter((slot) => !TIER_COPY[slot.id])
  const dayClosures = state.blackouts.filter((item) => item.date === date)
  const renderSlot = (slot: Slot) => {
    const booked = occupancy(slot.id)
    const full = booked >= slot.capacity
    const copy = TIER_COPY[slot.id]
    const closed =
      !slot.active ||
      dayClosures.some((item) => !item.slotId || item.slotId === slot.id)
    return (
      <Card key={slot.id} className={`p-5 ${full ? "border-danger-300" : ""}`}>
        <div className="flex justify-between">
          <span className="grid size-11 place-items-center rounded-xl bg-aqua-50 text-aqua-700">
            <CalendarDays size={21} />
          </span>
          <div className="flex flex-wrap justify-end gap-1.5">
            {full && <Badge tone="danger">Cap reached</Badge>}
            <Badge tone={closed ? "red" : "green"}>
              {closed ? "Closed" : "Open"}
            </Badge>
          </div>
        </div>
        <h2 className="mt-5 text-lg font-extrabold">{copy?.title ?? slot.label}</h2>
        <p className="text-sm text-slate-500">{slot.time}</p>
        <div className="mt-5">
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-slate-500">
              Booked on {shortDate(date)}
            </span>
            <strong>
              {booked}/{slot.capacity} guests
            </strong>
          </div>
          <CapacityBar value={booked} max={Math.max(1, slot.capacity)} />
          {waitingCount(state, date, slot.id) > 0 && (
            <p className="mt-2 text-xs font-semibold text-sky-800">{waitingCount(state, date, slot.id)} on waitlist for this day</p>
          )}
        </div>
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
            full ? "bg-danger-50 text-danger-700" : "bg-slate-50 text-slate-500"
          }`}
        >
          {full
            ? "Cap reached. Checkout is blocked for this tier until a booking is cancelled or the cap is raised."
            : `${Math.max(0, slot.capacity - booked)} spaces left. Checkout is blocked once the cap is reached.`}
        </p>
        <Button
          variant="secondary"
          className="mt-5 w-full"
          onClick={() => setEditing({ ...slot })}
        >
          <Edit3 size={16} /> {copy ? "Set head-count limit" : "Manage slot"}
        </Button>
      </Card>
    )
  }
  return (
    <AdminLayout>
      {leaveDialog}
      <PageTitle
        eyebrow="Operations"
        title="Slots & capacity"
        description="Day swimming, night swimming and overnight stays each have their own head-count limit. Guests cannot check out once a tier is full."
        action={
          <Input
            label="Managing date"
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">{tiers.map(renderSlot)}</div>
      {others.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-extrabold uppercase tracking-wider text-slate-500">
            Other bookable slots
          </h2>
          <div className="grid gap-5 lg:grid-cols-3">{others.map(renderSlot)}</div>
        </>
      )}
      <Card className="mt-6 p-5">
        <div className="flex gap-3">
          <AlertTriangle className="shrink-0 text-warning-600" />
          <div>
            <p className="font-bold">Hard-stop capacity safeguard</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Checkout is blocked once the cap is reached, counted per tier and
              per date from non-cancelled bookings. A cap cannot be set below the
              guests already booked on the date you are managing. Closing a tier
              prevents new reservations but keeps existing bookings intact.
            </p>
          </div>
        </div>
      </Card>
      <Card className="mt-6 p-5">
        <h2 className="text-lg font-extrabold">
          Blackout dates & special closures
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Block all reservations for maintenance, private events, holidays, or
          weather closures.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_1.4fr_auto] md:items-end">
          <Input
            label="Closure date"
            type="date"
            min={todayIso()}
            value={closureDate}
            onChange={(event) => setClosureDate(event.target.value)}
          />
          <Select
            label="Affected slot"
            value={closureSlot}
            onChange={(event) => setClosureSlot(event.target.value)}
          >
            <option value="">All slots</option>
            {state.slots.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.label}
              </option>
            ))}
          </Select>
          <Input
            label="Reason"
            placeholder="Typhoon, maintenance…"
            value={closureReason}
            onChange={(event) => setClosureReason(event.target.value)}
          />
          <Button
            disabled={!closureDate || !closureReason.trim()}
            onClick={() => {
              const affected = state.bookings.filter(
                (b) =>
                  b.date === closureDate &&
                  (!closureSlot || b.slotId === closureSlot) &&
                  !INACTIVE_STATUSES.includes(b.status),
              )
              const slotLabel =
                state.slots.find((slot) => slot.id === closureSlot)?.label ??
                "all slots"
              const run = () => {
                dispatch({
                  type: "ADD_BLACKOUT",
                  date: closureDate,
                  slotId: closureSlot || undefined,
                  reason: closureReason.trim(),
                })
                setClosureDate("")
                setClosureReason("")
              }
              ask({
                title: affected.length
                  ? "Conflict with existing bookings"
                  : "Block this date?",
                body: affected.length ? (
                  <>
                    {affected.length} active booking
                    {affected.length === 1 ? "" : "s"} (
                    {affected.map((b) => b.id).join(", ")}) already exist on{" "}
                    {shortDate(closureDate)} for {slotLabel}. Blocking will stop
                    new reservations but those guests keep their bookings and
                    may need to be rescheduled or cancelled manually. Reason:{" "}
                    {closureReason.trim()}.
                  </>
                ) : (
                  `${shortDate(closureDate)} (${slotLabel}) will be closed to new reservations. Reason: ${closureReason.trim()}. No existing bookings are affected.`
                ),
                confirmLabel: affected.length ? "Block anyway" : "Block date",
                danger: affected.length > 0,
                run,
              })
            }}
          >
            Block date
          </Button>
        </div>
        <div className="mt-5 grid gap-2">
          {state.blackouts.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning-200 bg-warning-50/60 px-4 py-3"
            >
              <div className="text-sm">
                <p className="font-bold">
                  {shortDate(item.date)} ·{" "}
                  {state.slots.find((slot) => slot.id === item.slotId)?.label ??
                    "All slots"}
                </p>
                <p className="text-xs text-slate-500">
                  {item.reason}
                  {item.kind ? ` · ${item.kind}` : ""}
                </p>
              </div>
              <Button
                variant="secondary"
                className="min-h-9 px-3"
                onClick={() => setRemoving(item)}
              >
                <Trash2 size={15} /> Remove
              </Button>
            </div>
          ))}
          {!state.blackouts.length && (
            <p className="text-sm text-slate-500">No closures are scheduled.</p>
          )}
        </div>
      </Card>
      {dialog}
      <ConfirmDialog
        open={!!removing}
        danger
        title="Remove this closure?"
        confirmLabel="Remove closure"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing)
            dispatch({
              type: "REMOVE_BLACKOUT",
              id: removing.id,
              by: currentUser?.name ?? "Admin",
            })
          setRemoving(null)
        }}
      >
        {removing && (
          <>
            Reopening {shortDate(removing.date)} (
            {state.slots.find((slot) => slot.id === removing.slotId)?.label ??
              "all slots"}
            ) lets guests book it again. Reason on file: {removing.reason}.
          </>
        )}
      </ConfirmDialog>
      <Modal
        open={!!editing}
        title={
          editing && TIER_COPY[editing.id]
            ? `${TIER_COPY[editing.id].title} limit`
            : "Manage time slot"
        }
        onClose={() => setEditing(null)}
      >
        {editing && (
          <div className="grid gap-5">
            <Input
              label={
                TIER_COPY[editing.id]?.unit ?? "Guest capacity"
              }
              type="number"
              min={editingOccupied}
              value={editing.capacity}
              error={capError}
              onChange={(e) =>
                setEditing({ ...editing, capacity: Number(e.target.value) })
              }
            />
            <p className="-mt-2 text-xs text-slate-500">
              {editingOccupied} guests booked on {shortDate(date)}. Checkout is
              blocked once this number is reached.
            </p>
            <label className="flex items-center justify-between rounded-xl border p-4">
              <span>
                <span className="block font-bold">Accept new reservations</span>
                <span className="text-xs text-slate-500">
                  Turn off to close this slot.
                </span>
              </span>
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) =>
                  setEditing({ ...editing, active: e.target.checked })
                }
              />
            </label>
            <Button
              disabled={!!capError}
              onClick={() => {
                const original = state.slots.find((s) => s.id === editing.id)
                const closing = !!original?.active && !editing.active
                const booked = state.bookings.filter(
                  (b) =>
                    b.slotId === editing.id &&
                    b.date >= todayIso() &&
                    !INACTIVE_STATUSES.includes(b.status),
                )
                const conflict = closing && booked.length > 0
                const slotName = TIER_COPY[editing.id]?.title ?? editing.label
                ask({
                  title: conflict
                    ? "Conflict with existing bookings"
                    : `Update ${slotName}?`,
                  body: (
                    <>
                      {original && original.capacity !== editing.capacity && (
                        <>
                          Capacity changes from {original.capacity} to{" "}
                          {editing.capacity} guests.{" "}
                        </>
                      )}
                      {original && original.active !== editing.active && (
                        <>
                          Reservations will be{" "}
                          {editing.active ? "opened" : "closed"} for this slot.{" "}
                        </>
                      )}
                      {conflict && (
                        <>
                          {booked.length} upcoming booking
                          {booked.length === 1 ? "" : "s"} (
                          {booked
                            .slice(0, 8)
                            .map((b) => b.id)
                            .join(", ")}
                          {booked.length > 8 ? ", ..." : ""}) already use this
                          slot and stay in place, so they may need manual
                          rescheduling.{" "}
                        </>
                      )}
                      {!conflict &&
                        original?.capacity === editing.capacity &&
                        original?.active === editing.active &&
                        "No values changed."}
                    </>
                  ),
                  confirmLabel: conflict ? "Block anyway" : "Save changes",
                  danger: conflict,
                  run: () => {
                    dispatch({ type: "UPDATE_SLOT", payload: editing })
                    setEditing(null)
                  },
                })
              }}
            >
              <Check size={17} /> Save changes
            </Button>
          </div>
        )}
      </Modal>
    </AdminLayout>
  )
}

function DurationCapNote({ compact = false }: { compact?: boolean }) {
  const { state } = useTampisaw()
  const day = durationCapFor(state.tariff, "day-tour")
  const night = durationCapFor(state.tariff, "night-swim")
  return (
    <div
      className={`rounded-xl border border-warning-200 bg-warning-50 text-warning-900 ${compact ? "p-3 text-xs" : "p-4 text-sm"}`}
    >
      <p className="font-bold">
        Rental ceiling: day cottages {day} h · night cottages {night} h
      </p>
      <p className="mt-1 leading-5">
        Set in the tariff, applies to every cottage rental, and the admin panel
        does not override it per cottage.{" "}
        <Link to="/admin/tariffs" className="font-extrabold underline">
          Change in Tariffs & overtime
        </Link>
      </p>
    </div>
  )
}

export function CottagesAdmin() {
  const { state, dispatch } = useTampisaw()
  const [editing, setEditing] = useState<Cottage | null>(null)
  const { dialog: leaveDialog } = useLeaveGuard(!!editing, "Leaving now will discard your unsaved changes.")
  const { ask, dialog } = useConfirm()
  const editError = !editing
    ? ""
    : !editing.name.trim()
      ? "Name is required."
      : !(editing.capacity >= 1)
        ? "Capacity must be at least 1."
        : editing.price < 0
          ? "Price cannot be negative."
          : ""
  return (
    <AdminLayout>
      {leaveDialog}
      <PageTitle
        eyebrow="Inventory"
        title="Cottage & room management"
        description="Keep cottages, overnight rooms, pricing, and operational status up to date."
        action={
          <Button
            onClick={() =>
              setEditing({
                id: `NEW-${Date.now()}`,
                name: "",
                capacity: 6,
                price: 0,
                status: "available",
                image: "/golden-pyramid/cutouts/cabana.jpg",
                amenities: [],
                kind: "cottage",
              })
            }
          >
            Add accommodation
          </Button>
        }
      />
      <div className="mb-5">
        <DurationCapNote />
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {state.cottages.map((cottage) => (
          <Card key={cottage.id} className="overflow-hidden">
            <div className="relative">
              <img loading="lazy" decoding="async"
                className="h-44 w-full object-cover"
                src={cottage.image}
                alt={cottage.name}
              />
              <span className="absolute left-3 top-3">
                <Badge
                  tone={cottage.status === "available" ? "green" : "red"}
                >
                  {cottage.status}
                </Badge>
              </span>
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-extrabold">{cottage.name}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Up to {cottage.capacity} guests
                    {(cottage.units ?? 1) > 1 ? ` · ${cottage.units} units` : ""}
                  </p>
                </div>
                <p className="font-extrabold text-aqua-700">
                  {cottage.price ? peso(cottage.price) : "Staff-confirmed rate"}
                </p>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                <span className="mr-2 font-bold capitalize text-aqua-700">
                  {cottage.kind}
                </span>
                {cottage.amenities.join(" · ")}
              </p>
              {cottage.kind === "cottage" && (
                <p className="mt-2 text-xs font-semibold text-warning-700">
                  Max rental: {durationCapFor(state.tariff, "day-tour")} h day ·{" "}
                  {durationCapFor(state.tariff, "night-swim")} h night
                </p>
              )}
              <Button
                variant="secondary"
                className="mt-5 w-full"
                onClick={() => setEditing({ ...cottage })}
              >
                <Edit3 size={16} /> Edit cottage
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <Modal
        open={!!editing}
        title="Accommodation details"
        onClose={() => setEditing(null)}
      >
        {editing && (
          <div className="grid gap-4">
            <div>
              <p className="mb-2 text-sm font-semibold text-ink-800">Picture</p>
              <div className="flex items-center gap-4">
                <img loading="lazy" decoding="async"
                  src={editing.image}
                  alt="Accommodation preview"
                  className="h-24 w-32 shrink-0 rounded-xl border object-cover"
                />
                <label className="grid gap-1 text-xs text-slate-500">
                  <span className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-aqua-800 hover:bg-slate-50">
                    Upload picture
                  </span>
                  <ImageInput
                    className="sr-only"
                    onPick={async (file) => {
                      if (!file) return
                      const { image } = await readProof(file)
                      if (image) setEditing((cur) => (cur ? { ...cur, image } : cur))
                    }}
                  />
                  JPG, JPEG or PNG. Shown to guests when booking.
                </label>
              </div>
            </div>
            <Input
              label="Name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Capacity"
                type="number"
                value={editing.capacity}
                onChange={(e) =>
                  setEditing({ ...editing, capacity: Number(e.target.value) })
                }
              />
              <Input
                label="Price"
                type="number"
                value={editing.price}
                onChange={(e) =>
                  setEditing({ ...editing, price: Number(e.target.value) })
                }
              />
              <Input
                label="Units available"
                type="number"
                min={1}
                value={editing.units ?? 1}
                onChange={(e) =>
                  setEditing({ ...editing, units: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
                }
              />
            </div>
            <Select
              label="Type"
              value={editing.kind}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  kind: e.target.value as Cottage["kind"],
                })
              }
            >
              <option value="cottage">Cottage / table</option>
              <option value="room">Resort room</option>
              <option value="event">Event place</option>
            </Select>
            <Select
              label="Operational status"
              value={editing.status}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  status: e.target.value as Cottage["status"],
                })
              }
            >
              <option value="available">Available</option>
              <option value="maintenance">Maintenance</option>
            </Select>
            {editing.kind === "cottage" && <DurationCapNote compact />}
            {editError && (
              <p className="text-xs font-semibold text-danger-600">{editError}</p>
            )}
            <Button
              disabled={!!editError}
              onClick={() => {
                const original = state.cottages.find((c) => c.id === editing.id)
                const upcoming =
                  editing.status === "maintenance"
                    ? state.bookings.filter(
                        (b) =>
                          b.cottageId === editing.id &&
                          b.date >= todayIso() &&
                          !INACTIVE_STATUSES.includes(b.status),
                      )
                    : []
                const changes: string[] = []
                if (!original) changes.push("A new accommodation will be added")
                else {
                  if (original.name !== editing.name)
                    changes.push(`name "${original.name}" to "${editing.name}"`)
                  if (original.capacity !== editing.capacity)
                    changes.push(
                      `capacity ${original.capacity} to ${editing.capacity}`,
                    )
                  if (original.image !== editing.image) changes.push("new picture")
                  if (original.price !== editing.price)
                    changes.push(
                      `price ${peso(original.price)} to ${peso(editing.price)}`,
                    )
                  if (original.kind !== editing.kind)
                    changes.push(`type ${original.kind} to ${editing.kind}`)
                  if (original.status !== editing.status)
                    changes.push(
                      `status ${original.status} to ${editing.status}`,
                    )
                }
                ask({
                  title: upcoming.length
                    ? "Maintenance conflicts with bookings"
                    : `Save ${editing.name || "accommodation"}?`,
                  body: (
                    <>
                      {changes.length
                        ? `${original ? "Changes: " : ""}${changes.join("; ")}. `
                        : "No values changed. "}
                      {upcoming.length > 0 &&
                        `${upcoming.length} upcoming booking${upcoming.length === 1 ? "" : "s"} (${upcoming
                          .slice(0, 8)
                          .map((b) => b.id)
                          .join(", ")}) reference this cottage and may need to be moved.`}
                    </>
                  ),
                  confirmLabel: upcoming.length
                    ? "Set to maintenance anyway"
                    : "Save accommodation",
                  danger: upcoming.length > 0,
                  run: () => {
                    dispatch({ type: "UPDATE_COTTAGE", payload: editing })
                    setEditing(null)
                  },
                })
              }}
            >
              Save accommodation
            </Button>
          </div>
        )}
      </Modal>
      {dialog}
    </AdminLayout>
  )
}

function askDeleteAccount(
  ask: ReturnType<typeof useConfirm>["ask"],
  state: ReturnType<typeof useTampisaw>["state"],
  dispatch: ReturnType<typeof useTampisaw>["dispatch"],
  by: string,
  user: { id: string, name: string, role: Role, guestId?: string },
) {
  const mine = user.guestId ? state.bookings.filter((b) => b.guestId === user.guestId) : []
  const unpaid = mine.filter((b) => b.paid <= 0).length
  const paid = mine.length - unpaid
  ask({
    title: `Delete ${user.name}'s account?`,
    danger: true,
    confirmLabel: "Delete account",
    cancelLabel: "Keep account",
    body: (
      <div className="grid gap-2">
        <p>This permanently removes the sign-in{user.role === "guest" ? ", guest profile and notifications" : ""}. The email can be used to sign up again. This cannot be undone.</p>
        {user.role === "guest" && (
          <ul className="list-disc pl-5">
            <li>{unpaid} unpaid booking(s) will be deleted and their slots released.</li>
            <li>{paid} paid booking(s) are kept for financial reports with the guest&apos;s name, contact details, and proofs removed. Upcoming ones are cancelled, so refund them first if owed.</li>
            <li>Incident and maintenance records stay, but are unlinked from the guest.</li>
          </ul>
        )}
      </div>
    ),
    run: () => dispatch({ type: "DELETE_USER", id: user.id, by }),
  })
}

export function GuestsAdmin() {
  const { state, dispatch, currentUser } = useTampisaw()
  const { ask, dialog } = useConfirm()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const guests = state.guests.filter((guest) =>
    matchesGuest(query, {
      id: guest.id,
      name: guest.name,
      email: guest.email,
      phone: guest.phone,
      extra: state.bookings
        .filter((b) => b.guestId === guest.id)
        .map((b) => b.id),
    }),
  )
  const guest = state.guests.find((item) => item.id === selected)
  return (
    <AdminLayout>
      <PageTitle
        eyebrow="Guest intelligence"
        title="Guest records"
        description="Review visit patterns and no-show history before following up."
      />
      <Card className="mb-5 p-4">
        <Input
          label="Search guest records"
          placeholder={SEARCH_PLACEHOLDER}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Card>
      <Card className="overflow-hidden">
        <div className="hidden grid-cols-[1.3fr_0.6fr_0.6fr_0.7fr_0.6fr_48px] border-b bg-slate-50 px-5 py-3 text-xs font-extrabold uppercase text-slate-500 lg:grid">
          <span>Guest</span>
          <span>Visits</span>
          <span>No-shows</span>
          <span>Last visit</span>
          <span>Risk</span>
          <span />
        </div>
        {guests.map((item) => (
          <div
            key={item.id}
            className="grid gap-3 border-b p-5 last:border-0 lg:grid-cols-[1.3fr_0.6fr_0.6fr_0.7fr_0.6fr_104px] lg:items-center"
          >
            <div>
              <p className="font-bold">{item.name}</p>
              <p className="text-xs text-slate-400">
                {item.email} · {item.phone}
              </p>
            </div>
            <p className="text-sm font-bold">{item.visits}</p>
            <p className="text-sm font-bold">{item.noShows}</p>
            <p className="text-sm">{shortDate(item.lastVisit)}</p>
            <RiskBadge risk={item.risk} />
            <div className="flex gap-2">
              <button
                className="grid size-10 place-items-center rounded-xl border"
                onClick={() => setSelected(item.id)}
                aria-label="View guest"
              >
                <Eye size={17} />
              </button>
              {(() => {
                const account = state.users.find((u) => u.guestId === item.id)
                return account ? (
                  <>
                    <button
                      className="min-h-10 rounded-xl border px-3 text-xs font-bold text-slate-600"
                      onClick={() =>
                        account.archived
                          ? void dispatch({ type: "RESTORE_GUEST", id: account.id }, { silent: true })
                          : ask({
                              title: `Archive ${item.name}'s account?`,
                              body: "They will not be able to sign in. Their bookings and history are kept and you can restore the account later.",
                              confirmLabel: "Archive account",
                              run: () => void dispatch({ type: "ARCHIVE_GUEST", id: account.id }, { silent: true }),
                            })
                      }
                    >
                      {account.archived ? "Restore" : "Archive"}
                    </button>
                    <button
                      className="grid size-10 place-items-center rounded-xl border border-rose-200 text-rose-600"
                      onClick={() => askDeleteAccount(ask, state, dispatch, currentUser?.name ?? "Admin", account)}
                      aria-label={`Delete ${item.name}'s account permanently`}
                      title="Delete permanently"
                    >
                      <Trash2 size={17} />
                    </button>
                  </>
                ) : null
              })()}
            </div>
          </div>
        ))}
        {!guests.length && (
          <p className="p-8 text-center text-sm text-slate-500">
            No guest matches that name, email, mobile number or booking id.
          </p>
        )}
      </Card>
      <Modal
        open={!!guest}
        title="Guest history"
        onClose={() => setSelected(null)}
      >
        {guest && (
          <div>
            <div className="rounded-xl bg-sand-100 p-4">
              <p className="text-lg font-extrabold">{guest.name}</p>
              <p className="text-sm text-slate-500">
                {guest.email} · {guest.phone}
              </p>
              <div className="mt-3">
                <RiskBadge risk={guest.risk} />
              </div>
              {(() => {
                const account = state.users.find((u) => u.guestId === guest.id)
                return account?.birthdate ? <p className="mt-4 text-xs text-slate-500">Born {account.birthdate}</p> : null
              })()}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border p-3">
                <p className="text-xl font-extrabold">{guest.visits}</p>
                <p className="text-xs text-slate-500">Visits</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xl font-extrabold">{guest.cancellations}</p>
                <p className="text-xs text-slate-500">Cancelled</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xl font-extrabold">{guest.noShows}</p>
                <p className="text-xs text-slate-500">No-shows</p>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-600">
              {guest.risk === "high"
                ? "High risk due to repeated cancellations and two recent no-shows. Confirm by phone before peak-day reservations."
                : guest.risk === "medium"
                  ? "Moderate risk based on one previous no-show."
                  : "Reliable guest with no recorded no-shows."}
            </p>
          </div>
        )}
      </Modal>
      {dialog}
    </AdminLayout>
  )
}

export function PoliciesAdmin() {
  const { state, dispatch, currentUser } = useTampisaw()
  const { ask, dialog } = useConfirm()
  const [editing, setEditing] = useState<Policy | null>(null)
  const { dialog: leaveDialog } = useLeaveGuard(!!editing, "Leaving now will discard your unsaved changes.")
  const by = currentUser?.name ?? "Admin"
  const error = !editing ? "" : !editing.title.trim() ? "Add a title." : !editing.body.trim() ? "Write the rule or policy text." : ""
  return (
    <AdminLayout>
      {leaveDialog}
      <PageTitle
        eyebrow="Guest information"
        title="Resort policies"
        description="These appear in the Resort policies section on the home page. Add, edit or remove them as the resort's rules change."
        action={<Button onClick={() => setEditing({ id: `pol-${Date.now()}`, title: "", body: "" })}>Add policy</Button>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {state.policies.map((p) => (
          <Card key={p.id} className="flex flex-col p-5">
            <h2 className="text-lg font-extrabold">{p.title}</h2>
            <p className="mt-2 flex-1 whitespace-pre-line text-sm leading-6 text-slate-600">{p.body}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={() => setEditing({ ...p })}>
                <Edit3 size={15} /> Edit
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  ask({
                    title: `Remove "${p.title}"?`,
                    body: "Guests will no longer see this policy on the home page.",
                    confirmLabel: "Remove policy",
                    danger: true,
                    run: () => dispatch({ type: "DELETE_POLICY", id: p.id, by }),
                  })
                }
              >
                <Trash2 size={15} /> Remove
              </Button>
            </div>
          </Card>
        ))}
        {!state.policies.length && (
          <Card className="p-8 text-center text-sm text-slate-500 md:col-span-2">No policies yet. Add the first one.</Card>
        )}
      </div>
      <Modal open={!!editing} title={state.policies.some((p) => p.id === editing?.id) ? "Edit policy" : "Add policy"} onClose={() => setEditing(null)}>
        {editing && (
          <div className="grid gap-4">
            <Input label="Title" value={editing.title} placeholder="e.g. Cancellation" onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <label className="grid gap-2 text-sm font-semibold text-ink-800">
              Rule or policy text
              <textarea
                rows={5}
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base font-normal outline-none transition focus:border-aqua-500 focus:ring-4 focus:ring-aqua-100"
              />
            </label>
            {error && <p className="text-xs font-semibold text-danger-600">{error}</p>}
            <Button
              disabled={!!error}
              onClick={() => {
                dispatch({ type: "SAVE_POLICY", policy: { ...editing, title: editing.title.trim(), body: editing.body.trim() }, by })
                setEditing(null)
              }}
            >
              Save policy
            </Button>
          </div>
        )}
      </Modal>
      {dialog}
    </AdminLayout>
  )
}

/** Archive (soft delete), restore and permanent delete for one booking. Only finished bookings can be archived; only an admin can delete one for good, and never one that handled money. */
export function BookingArchiveControls({ booking, onDone }: { booking: Booking; onDone?: () => void }) {
  const { dispatch, currentUser } = useTampisaw()
  const { ask, dialog } = useConfirm()
  const [msg, setMsg] = useState("")
  const finished = ["cancelled", "expired", "no-show", "completed", "checked-out"].includes(booking.status)
  const run = async (type: "ARCHIVE_BOOKING" | "RESTORE_BOOKING" | "DELETE_BOOKING_PERMANENT", ok: string) => {
    const r = await dispatch({ type, id: booking.id }, { silent: true })
    setMsg(r.ok ? ok : (r.error ?? "That could not be done."))
    if (r.ok) onDone?.()
  }
  if (!booking.archived && !finished) return null
  return (
    <div className="grid gap-2 rounded-xl border border-dashed border-slate-300 p-3">
      {booking.archived ? (
        <>
          <p className="text-xs font-bold text-slate-500">Archived{booking.archivedBy ? ` by ${booking.archivedBy}` : ""}</p>
          <Button variant="secondary" onClick={() => void run("RESTORE_BOOKING", "Booking restored from the archive.")}>Restore booking</Button>
          {isAdminRole(currentUser?.role) && (
            <Button
              variant="danger"
              onClick={() =>
                ask({
                  title: `Permanently delete ${booking.id}?`,
                  body: "This cannot be undone. Bookings with payments or refunds cannot be deleted; they stay in the archive for the financial reports.",
                  confirmLabel: "Delete permanently",
                  danger: true,
                  run: () => void run("DELETE_BOOKING_PERMANENT", "Booking permanently deleted."),
                })
              }
            >
              Delete permanently
            </Button>
          )}
        </>
      ) : (
        <Button
          variant="secondary"
          onClick={() =>
            ask({
              title: `Archive ${booking.id}?`,
              body: "It moves to the archive and leaves the working lists. It never blocks availability and you can restore it later.",
              confirmLabel: "Archive",
              run: () => void run("ARCHIVE_BOOKING", "Booking archived."),
            })
          }
        >
          Archive booking
        </Button>
      )}
      {msg && <p role="status" className="text-xs font-semibold text-aqua-800">{msg}</p>}
      {dialog}
    </div>
  )
}
