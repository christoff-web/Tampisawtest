import { cameraMessage, openCamera, OpenInNewTabButton } from "../components/camera-fallback"
import { PhoneField } from "../components/auth-bits"
import { waitingCount } from "../lib/waitlist"
import { ProofViewer } from "../components/proof"
import { RescheduleButton } from "../components/reschedule"
import {
  AlertTriangle,
  Banknote,
  BellRing,
  Camera,
  ScanLine,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Footprints,
  Info,
  Palmtree,
  Printer,
  QrCode,
  Search,
  ShieldAlert,
  Users,
  Watch,
  Wrench,
  XCircle,
} from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { StaffLayout } from "../components/layouts"
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
import { useTampisaw } from "../store"
import { GateResultScreen, ManualLookup, MuteToggle, OfflineBanner, SyncPanel, Toast, gateFeedback, useGateMute, useOfflineSync, type GateKind } from "./gate-kit"
import { ConfirmDialog, useConfirm } from "../components/confirm"
import { useLeaveGuard } from "../components/leave-guard"
import {
  computeOvertime,
  formatCountdown,
  arrivalLabel,
  healthQuestions,
  canAccess,
  canHandleCash,
  roleLabel,
  sessionMinutesFor,
  sessionRemainingMs,
  signQrToken,
  verifyQrToken,
  unitAvailability,
  lettersOnly,
  digitsOnly,
  unitsOf,
  addonLeft,
  isAdminRole,
  isValidPhone,
  paymentOptionLabel,
  paymentProgress,
} from "../lib/ops"
import { AddonSelector } from "./guest-parts"
import type { AppState, Booking, BookingAddon, Cottage } from "../types"
import {
  balanceOf,
  hoursUntil,
  needsConfirmation,
  peso,
  prettyDate,
  prettyDateTime,
  requiredNow,
  slotLabels,
  slotStart,
  todayISO,
} from "../lib/rules"

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

type ServiceType = Booking["type"]

const DEAD: Booking["status"][] = ["cancelled", "expired", "no-show"]
const LIVE: Booking["status"][] = ["checked-in", "checked-out", "completed"]
const isActive = (b: Booking) => !DEAD.includes(b.status) && !b.archived

const legacySlots: Record<string, string> = {
  morning: "day-tour",
  afternoon: "night-swim",
  evening: "room-stay",
}
const canon = (id: string) => legacySlots[id] ?? id

const slotEndHour: Record<string, number> = {
  "day-tour": 16,
  "night-swim": 26,
  "room-stay": 35,
  event: 24,
}
const slotEnd = (b: Pick<Booking, "date" | "slotId">) => {
  const d = new Date(`${b.date}T00:00:00`)
  d.setHours(slotEndHour[canon(b.slotId)] ?? 17, 0, 0, 0)
  return d
}
const slotEnded = (b: Pick<Booking, "date" | "slotId">) =>
  slotEnd(b).getTime() < Date.now()

const shortTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : undefined

const timeInOf = (b: Booking) => shortTime(b.timeIn) ?? b.checkedInAt ?? "—"
const timeOutOf = (b: Booking) => shortTime(b.timeOut) ?? "—"

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const slotName = (state: AppState, id: string) =>
  state.slots.find((s) => canon(s.id) === canon(id))?.label ??
  slotLabels[canon(id)] ??
  id

const itemName = (state: AppState, id?: string) =>
  id ? (state.cottages.find((c) => c.id === id)?.name ?? id) : "Pool entry"

/** Normalize PH mobile numbers: strip spaces, dashes, brackets; +63 / 63 -> 0. */
const normPhone = (s: string) =>
  s.replace(/[\s\-().]/g, "").replace(/^\+?63/, "0")

/** Omnichannel match: guest name, email, mobile number or booking id. */
function matchesBooking(b: Booking, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const phoneQ = normPhone(q)
  return (
    b.guestName.toLowerCase().includes(q) ||
    (b.email ?? "").toLowerCase().includes(q) ||
    b.id.toLowerCase().includes(q) ||
    (phoneQ.length >= 3 &&
      /^[0-9]+$/.test(phoneQ) &&
      normPhone(b.phone ?? "").includes(phoneQ))
  )
}

/** Live countdown for a checked-in booking; fires the expiry alert once. */
function LiveSessionTimer({
  booking,
  tariffAlertMinutes,
  onAlert,
}: {
  booking: Booking
  tariffAlertMinutes: number
  onAlert?: () => void
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const ms = sessionRemainingMs(booking, now)
  const low = ms !== null && ms < tariffAlertMinutes * 60_000
  useEffect(() => {
    if (low && !booking.expiryAlertSentAt) onAlert?.()
  }, [low, booking.expiryAlertSentAt, onAlert])
  if (ms === null) return null
  const tone =
    ms < 0
      ? "bg-danger-100 text-danger-800"
      : low
        ? "bg-warning-100 text-warning-800"
        : "bg-success-100 text-success-800"
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs font-bold ${tone}`}
      aria-live="off"
    >
      <Clock3 size={13} /> {ms < 0 ? "Overdue " : ""}
      {formatCountdown(ms)}
    </span>
  )
}

const CASH_NOTE = "Cash handling is limited to the front desk and admin."

function CashNote() {
  return <p className="text-xs text-slate-500">{CASH_NOTE}</p>
}

/** Describes an existing live booking that clashes with the proposed one, or null. */
function findDoubleBooking(
  state: AppState,
  q: {
    date: string
    slotId: string
    cottageId?: string
    name?: string
    phone?: string
  },
): string | null {
  const live = state.bookings.filter(
    (b) =>
      b.date === q.date && canon(b.slotId) === canon(q.slotId) && isActive(b),
  )
  const item = q.cottageId ? state.cottages.find((c) => c.id === q.cottageId) : undefined
  if (item) {
    const avail = unitAvailability(state, item, q.date, q.slotId)
    if (avail.left <= 0)
      return avail.blockedBy ?? `${item.name} is fully booked on ${prettyDate(q.date)}, ${slotName(state, q.slotId)}.`
  }
  const name = (q.name ?? "").trim().toLowerCase()
  const phone = normPhone(q.phone ?? "")
  const same = live.find(
    (b) =>
      (name &&
        b.guestName.trim().toLowerCase() === name &&
        (!phone || !b.phone || normPhone(b.phone) === phone)) ||
      (phone.length >= 7 && b.phone && normPhone(b.phone) === phone),
  )
  if (same)
    return `${same.guestName} already has booking ${same.id} on ${prettyDate(q.date)}, ${slotName(state, q.slotId)}.`
  return null
}

function useActor() {
  const { currentUser } = useTampisaw()
  return currentUser?.name ?? "Receptionist"
}

function Note({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger"
  children: ReactNode
}) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-success-200 bg-success-50 text-success-900",
    warning: "border-warning-200 bg-warning-50 text-warning-900",
    danger: "border-danger-200 bg-danger-50 text-danger-900",
  }
  const icon =
    tone === "success" ? (
      <CheckCircle2 size={18} />
    ) : tone === "danger" ? (
      <XCircle size={18} />
    ) : tone === "warning" ? (
      <AlertTriangle size={18} />
    ) : (
      <Info size={18} />
    )
  return (
    <div
      className={`flex gap-3 rounded-xl border p-3.5 text-sm leading-6 ${tones[tone]}`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-ink-900">{children}</span>
    </div>
  )
}

const payBadge = (b: Booking) =>
  b.paid >= b.total ? (
    <Badge tone="success">Paid</Badge>
  ) : b.paid > 0 && b.receipt === "reserved" ? (
    <Badge tone="info">Reserved</Badge>
  ) : (
    <Badge tone="warning">Pending</Badge>
  )

const sourceBadge = (b: Booking) =>
  b.source === "walk-in" ? (
    <Badge tone="info">Walk-in</Badge>
  ) : (
    <Badge>Online</Badge>
  )

/* ------------------------------------------------------------------ */
/* 1. Dashboard                                                        */
/* ------------------------------------------------------------------ */

export function StaffDashboard() {
  const { state, dispatch, todayBookings, headcount, currentUser } =
    useTampisaw()
  const today = todayISO()
  const inHouse = state.bookings.filter((b) => b.status === "checked-in")
  const live = todayBookings.filter(isActive)
  const expected = live.reduce((s, b) => s + b.guests, 0)
  const capacity = state.slots
    .filter((s) => s.active && ["day-tour", "night-swim"].includes(s.id))
    .reduce((s, x) => s + x.capacity, 0)
  const proofs = state.bookings.filter(
    (b) => b.paymentStatus === "submitted",
  ).length
  const cancels = state.bookings.filter(
    (b) => b.status === "cancellation-requested",
  ).length
  const incidents = state.incidents.filter((i) =>
    ["requested", "in-progress"].includes(i.status),
  ).length
  const maint = state.maintenance.filter((m) =>
    ["requested", "on-the-way"].includes(m.status),
  ).length
  const arrivals = [...live].sort(
    (a, b) => slotStart(a).getTime() - slotStart(b).getTime(),
  )
  const notices = state.notices
    .filter((n) => n.audience === "staff")
    .slice(0, 6)
  const closed = new Date(`${today}T12:00:00`).getDay() === 2

  const shortcuts = [
    {
      to: "/staff/appointments",
      label: "Appointments",
      hint: "View and update bookings",
      icon: ClipboardList,
    },
    {
      to: "/staff/cottages",
      label: "Cottage reservations",
      hint: "Daily cottage grid",
      icon: Palmtree,
    },
    {
      to: "/staff/qr",
      label: "QR verification",
      hint: "Check in and bracelets",
      icon: QrCode,
    },
    {
      to: "/staff/walk-in",
      label: "Walk-in entry",
      hint: "Acquire, reserve, book",
      icon: Footprints,
    },
    {
      to: "/staff/payments",
      label: "Payments & refunds",
      hint: `${proofs} proofs, ${cancels} cancellations`,
      icon: Banknote,
    },
    {
      to: "/staff/bracelets",
      label: "Bracelets & time out",
      hint: "Spot checks and returns",
      icon: Watch,
    },
    {
      to: "/staff/incidents",
      label: "Incidents",
      hint: `${incidents} open`,
      icon: ShieldAlert,
    },
    {
      to: "/staff/maintenance",
      label: "Maintenance",
      hint: `${maint} open`,
      icon: Wrench,
    },
    {
      to: "/staff/addons",
      label: "Add-ons & deposits",
      hint: "Inventory and damage fees",
      icon: Palmtree,
    },
  ].filter((x) => !currentUser || canAccess(currentUser.role, x.to))

  return (
    <StaffLayout>
      <PageTitle
        eyebrow={`${
          currentUser ? roleLabel[currentUser.role] : "Staff"
        } dashboard`}
        title={`Good day, ${currentUser?.name.split(" ")[0] ?? "team"}`}
        description={`${prettyDate(today)}. Check-in and daily operations for Golden Pyramid.`}
        action={
          <Link to="/staff/walk-in">
            <Button>
              <Footprints size={18} /> New walk-in
            </Button>
          </Link>
        }
      />
      {closed && (
        <div className="mb-5">
          <Note tone="warning">
            The resort is closed on Tuesdays. No arrivals are expected today.
          </Note>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Expected today"
          value={expected}
          detail={`${live.length} bookings`}
          icon={<Users size={20} />}
        />
        <Card className="p-5">
          <div className="mb-4 flex items-start justify-between">
            <p className="text-sm font-semibold text-slate-500">
              Checked in now
            </p>
            <span className="grid size-10 place-items-center rounded-xl bg-aqua-50 text-aqua-700">
              <CheckCircle2 size={20} />
            </span>
          </div>
          <p className="text-3xl font-extrabold tracking-tight text-ink-900">
            {headcount}
            <span className="text-base font-semibold text-slate-400">
              {" "}
              / {capacity}
            </span>
          </p>
          <div className="mt-3">
            <CapacityBar value={headcount} max={Math.max(1, capacity)} />
          </div>
        </Card>
        <StatCard
          label="Pending proofs"
          value={proofs}
          detail="Payments awaiting review"
          icon={<Banknote size={20} />}
        />
        <StatCard
          label="Cancellation requests"
          value={cancels}
          detail="Handled in Payments & refunds"
          icon={<XCircle size={20} />}
        />
        <StatCard
          label="Open incidents"
          value={incidents}
          detail="Requested or in progress"
          icon={<ShieldAlert size={20} />}
        />
        <StatCard
          label="Open maintenance"
          value={maint}
          detail="Requested or on the way"
          icon={<Wrench size={20} />}
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <div>
            <h2 className="mb-3 text-lg font-extrabold text-ink-900">
              Modules
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {shortcuts.map((s) => (
                <Link
                  key={s.to}
                  to={s.to}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-aqua-300 hover:shadow-md"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-aqua-50 text-aqua-700 transition group-hover:bg-aqua-600 group-hover:text-white">
                    <s.icon size={20} />
                  </span>
                  <span>
                    <span className="block text-sm font-extrabold text-ink-900">
                      {s.label}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {s.hint}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {inHouse.length > 0 && (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <h2 className="text-lg font-extrabold text-ink-900">
                  In the water now
                </h2>
                <span className="text-xs font-semibold text-slate-500">
                  Amber under {state.tariff.expiryAlertMinutes} min, red when
                  overdue
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {inHouse.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-ink-900">
                        {b.guestName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {b.id} · {b.guests} guests · in at {timeInOf(b)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <LiveSessionTimer
                        booking={b}
                        tariffAlertMinutes={state.tariff.expiryAlertMinutes}
                        onAlert={() =>
                          dispatch({ type: "EXPIRY_ALERT", id: b.id })
                        }
                      />
                      <Link to={`/staff/qr?code=${b.id}`}>
                        <Button
                          variant="secondary"
                          className="min-h-9 px-3 py-1.5"
                        >
                          Check out
                        </Button>
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <h2 className="text-lg font-extrabold text-ink-900">
                Today's arrivals
              </h2>
              <Link
                to="/staff/appointments"
                className="text-sm font-bold text-aqua-700 hover:underline"
              >
                All appointments
              </Link>
            </div>
            {arrivals.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">
                No arrivals scheduled for today.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {arrivals.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-ink-900">
                        {b.guestName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {b.id} · {slotName(state, b.slotId)} · {b.guests} guests
                        · {itemName(state, b.cottageId)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {sourceBadge(b)}
                      <StatusBadge status={b.status} />
                      {!LIVE.includes(b.status) && (
                        <Link to={`/staff/qr?code=${b.id}`}>
                          <Button
                            variant="secondary"
                            className="min-h-9 px-3 py-1.5"
                          >
                            Verify
                          </Button>
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit p-5">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold text-ink-900">
            <BellRing size={18} className="text-aqua-700" /> Notices for staff
          </h2>
          {notices.length === 0 ? (
            <p className="text-sm text-slate-500">You are all caught up.</p>
          ) : (
            <ul className="space-y-3">
              {notices.map((n) => (
                <li
                  key={n.id}
                  className="rounded-xl bg-sand-50 p-3 text-sm leading-6 text-ink-800"
                >
                  {n.message}
                  <span className="mt-1 block text-xs text-slate-400">
                    {prettyDateTime(n.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </StaffLayout>
  )
}

/* ------------------------------------------------------------------ */
/* 2. Appointments                                                     */
/* ------------------------------------------------------------------ */

type Tab = "all" | "today" | "upcoming" | "cancelled" | "archived"
const PAGE_SIZE = 10

export function AppointmentsPage() {
  const { state, dispatch } = useTampisaw()
  const actor = useActor()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>("all")
  const [query, setQuery] = useState("")
  const [sourceFilter, setSourceFilter] = useState<"all" | "online" | "walk-in">("all")
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(
    params.get("booking"),
  )
  const [msg, setMsg] = useState("")
  const today = todayISO()

  const rows = useMemo(() => {
    return state.bookings
      .filter((b) => {
        // Archived bookings only appear in the Archived tab.
        if (tab === "archived") return !!b.archived
        if (b.archived) return false
        if (tab === "today") return b.date === today && isActive(b)
        if (tab === "upcoming") return b.date > today && isActive(b)
        if (tab === "cancelled")
          return (
            DEAD.includes(b.status) || b.status === "cancellation-requested"
          )
        return true
      })
      .filter((b) => matchesBooking(b, query))
      .filter((b) => sourceFilter === "all" || (b.source ?? "online") === sourceFilter)
      .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
  }, [state.bookings, tab, query, today, sourceFilter])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const selected = state.bookings.find((b) => b.id === selectedId)
  const tabs: [Tab, string][] = [
    ["all", "All"],
    ["today", "Today"],
    ["upcoming", "Upcoming"],
    ["cancelled", "Cancelled"],
    ["archived", "Archived"],
  ]

  const open = (id: string) => {
    setMsg("")
    setSelectedId(id)
  }

  return (
    <StaffLayout>
      <PageTitle
        eyebrow="Appointments"
        title="View and manage appointments"
        description="Every online reservation and walk-in. Select a row to review, remind, update or close it out."
        action={
          <Link to="/staff/walk-in">
            <Button>
              <Footprints size={18} /> Walk-in
            </Button>
          </Link>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-1 rounded-xl bg-sand-100 p-1">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                onClick={() => {
                  setTab(id)
                  setPage(0)
                }}
                className={`min-h-10 flex-1 rounded-lg px-4 text-sm font-bold transition md:flex-none ${
                  tab === id
                    ? "bg-white text-aqua-800 shadow-sm"
                    : "text-slate-600 hover:text-ink-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            aria-label="Booking source"
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value as typeof sourceFilter)
              setPage(0)
            }}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold"
          >
            <option value="all">Online and walk-in</option>
            <option value="online">Online only</option>
            <option value="walk-in">Walk-in only</option>
          </select>
          <label className="relative block md:w-72">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(0)
              }}
              placeholder="Search name, email, mobile or code"
              className="min-h-11 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-aqua-500 focus:ring-4 focus:ring-aqua-100"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-sand-50 text-xs font-extrabold uppercase tracking-wide text-slate-500">
              <tr>
                {[
                  "Guest",
                  "Date & slot",
                  "Source",
                  "Status",
                  "Risk",
                  "Payment",
                  "Balance",
                  "Time in / out",
                ].map((h) => (
                  <th key={h} className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => open(b.id)}
                  className="cursor-pointer transition hover:bg-aqua-50/50"
                >
                  <td className="px-4 py-3">
                    <p className="font-extrabold text-ink-900">{b.guestName}</p>
                    <p className="text-xs text-slate-500">
                      {b.id} · {b.guests} pax
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{prettyDate(b.date)}</p>
                    <p className="text-xs text-slate-500">
                      {slotName(state, b.slotId)}
                    </p>
                  </td>
                  <td className="px-4 py-3">{sourceBadge(b)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="px-4 py-3">
                    {b.source === "walk-in" ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <RiskBadge risk={b.risk} />
                    )}
                  </td>
                  <td className="px-4 py-3">{payBadge(b)}</td>
                  <td className="px-4 py-3 font-semibold">
                    {balanceOf(b) > 0 ? peso(balanceOf(b)) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {timeInOf(b)} / {timeOutOf(b)}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-slate-500"
                  >
                    No appointments in this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 p-4 text-sm">
          <span className="text-slate-500">
            {rows.length} appointment{rows.length === 1 ? "" : "s"} · page{" "}
            {current + 1} of {pages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        open={!!selected}
        title="Appointment details"
        onClose={() => setSelectedId(null)}
      >
        {selected && (
          <AppointmentDetail
            booking={selected}
            msg={msg}
            setMsg={setMsg}
            actor={actor}
            dispatch={dispatch}
          />
        )}
      </Modal>
    </StaffLayout>
  )
}

function AppointmentDetail({
  booking: b,
  msg,
  setMsg,
  actor,
  dispatch,
}: {
  booking: Booking
  msg: string
  setMsg: (m: string) => void
  actor: string
  dispatch: ReturnType<typeof useTampisaw>["dispatch"]
}) {
  const { state, currentUser } = useTampisaw()
  const cash = canHandleCash(currentUser?.role)
  const { ask, dialog } = useConfirm()
  const [confirm, setConfirm] = useState<"cancel" | "noshow" | null>(null)
  const online = b.source !== "walk-in"
  const ended = slotEnded(b)
  const openStatus = ["pending", "reserved", "confirmed"].includes(b.status)
  const showReminder =
    online && openStatus && (b.status === "pending" || b.risk !== "low")
  const toCollect = Math.max(0, (b.dueNow ?? b.total) - b.paid)
  const canNoShow = openStatus && ended
  // Soft delete: only finished bookings can be archived; archived ones can be restored; only an admin can delete one for good,
  // and never one that handled money (those stay for the financial reports).
  const finished = ["cancelled", "expired", "no-show", "completed", "checked-out"].includes(b.status)
  const archiveActions = b.archived ? (
    <div className="grid gap-2 rounded-xl border border-dashed border-slate-300 p-3">
      <p className="text-xs font-bold text-slate-500">Archived {b.archivedAt ? prettyDate(b.archivedAt.slice(0, 10)) : ""}{b.archivedBy ? ` by ${b.archivedBy}` : ""}</p>
      <Button variant="secondary" onClick={() => void dispatch({ type: "RESTORE_BOOKING", id: b.id }, { silent: true }).then((r) => setMsg(r.ok ? "Booking restored from the archive." : (r.error ?? "Could not restore.")))}>Restore booking</Button>
      {isAdminRole(currentUser?.role) && (
        <Button
          variant="danger"
          onClick={() =>
            ask({
              title: `Permanently delete ${b.id}?`,
              body: "This cannot be undone. Bookings with payments or refunds cannot be deleted, they stay in the archive for the financial reports.",
              confirmLabel: "Delete permanently",
              danger: true,
              run: () => void dispatch({ type: "DELETE_BOOKING_PERMANENT", id: b.id }, { silent: true }).then((r) => setMsg(r.ok ? "Booking permanently deleted." : (r.error ?? "Could not delete."))),
            })
          }
        >
          Delete permanently
        </Button>
      )}
    </div>
  ) : finished ? (
    <Button
      variant="secondary"
      onClick={() =>
        ask({
          title: `Archive ${b.id}?`,
          body: "It moves to the archive and stops appearing in the working lists. It never blocks availability, and you can restore it later.",
          confirmLabel: "Archive",
          run: () => void dispatch({ type: "ARCHIVE_BOOKING", id: b.id }, { silent: true }).then((r) => setMsg(r.ok ? "Booking archived." : (r.error ?? "Could not archive."))),
        })
      }
    >
      Archive booking
    </Button>
  ) : null
  const canCancelUnconfirmed =
    online &&
    openStatus &&
    !ended &&
    !b.attendanceConfirmed &&
    needsConfirmation(b, state.settings) &&
    hoursUntil(b) < state.settings.confirmationHours

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={b.status} />
        {sourceBadge(b)}
        {online && <RiskBadge risk={b.risk} />}
      </div>
      <div className="rounded-xl bg-sand-50 px-4">
        <Row label="Guest">{b.guestName}</Row>
        <Row label="Phone">{b.phone || "—"}</Row>
        <Row label="Booking">{b.id}</Row>
        {arrivalLabel(b) && <Row label="Arrival">{arrivalLabel(b)}</Row>}
        <Row label="Slot">
          {prettyDate(b.date)} · {slotName(state, b.slotId)}
        </Row>
        <Row label="Service">
          {itemName(state, b.cottageId)} · {b.guests} pax
        </Row>
        <Row label="Payment">
          {payBadge(b)} {peso(b.paid)} of {peso(b.total)}
        </Row>
        <Row label="Balance due">{peso(balanceOf(b))}</Row>
        <Row label="Payment option">{paymentOptionLabel(b.paymentOption)}</Row>
        <Row label="Payment status">{paymentProgress(b)}</Row>
        {b.cancelReason && <Row label="Cancel reason">{b.cancelReason}</Row>}
        <Row label="Receipt">
          {b.receipt === "official"
            ? "Official receipt"
            : b.receipt === "reserved"
              ? "RESERVED receipt"
              : "None"}
        </Row>
        <Row label="Time in / out">
          {timeInOf(b)} / {timeOutOf(b)}
        </Row>
        <Row label="Bracelets">
          {(b.bracelets ?? []).filter((x) => !x.voided).length || "None issued"}
        </Row>
      </div>

      {msg && <Note tone="success">{msg}</Note>}
      {archiveActions}

      {b.status === "cancellation-requested" && (
        <Note tone="warning">
          Cancellation requested by the guest. Refund or deposit is decided in
          Payments & refunds (3–5 business days).
          <Link
            to={`/staff/payments?booking=${b.id}`}
            className="mt-2 block font-extrabold text-aqua-800 underline"
          >
            Go to Payments & refunds
          </Link>
        </Note>
      )}

      {b.status === "no-show" && (
        <Note tone="info">
          Marked as no-show. Payment kept as deposit; the guest may request a
          refund after 3–5 business days.
        </Note>
      )}

      <div className="grid gap-2">
        {(b.proofName || b.balanceProof) && (
          <div className="flex flex-wrap gap-2">
            {b.proofName && <ProofViewer name={b.proofName} image={b.proofImage} label="View payment proof" method={b.paymentMethod === "cash" ? "Cash" : "QR payment"} amount={b.dueNow ?? b.total} />}
            {b.balanceProof && <ProofViewer name={b.balanceProof.name} image={b.balanceProof.image} label="View balance proof" />}
          </div>
        )}
        <RescheduleButton booking={b} actor={actor} onDone={setMsg} />
        {!cash &&
          ((b.status === "pending" &&
            (b.paymentStatus === "submitted" || toCollect > 0)) ||
            ((b.status === "reserved" || b.status === "confirmed") &&
              balanceOf(b) > 0)) && <CashNote />}
        {cash && b.status === "pending" && b.paymentStatus === "submitted" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {b.staffApproval && !isAdminRole(currentUser?.role) ? (
              <p className="rounded-xl bg-warning-50 p-3 text-sm font-bold text-warning-900">Awaiting admin confirmation that the money was received.</p>
            ) : (
            <Button
              onClick={() =>
                ask({
                  title: isAdminRole(currentUser?.role) ? "Confirm the money was received?" : "Send proof to admin?",
                  body: `Booking ${b.id} for ${b.guestName} (${prettyDate(b.date)}, ${slotName(state, b.slotId)}) will be marked as paid and moved out of Pending. Confirm the proof matches ${peso(toCollect || b.paid)}.`,
                  confirmLabel: "Approve proof",
                  run: () => {
                    dispatch({
                      type: "VERIFY_PAYMENT",
                      id: b.id,
                      approved: true,
                      by: actor,
 byRole: currentUser?.role,
                    })
                    setMsg("Proof verified. Status updated from Pending.")
                  },
                })
              }
            >
              {isAdminRole(currentUser?.role) ? "Confirm payment received" : "Send proof to admin"}
            </Button>
            )}
            <Button
              variant="danger"
              onClick={() =>
                ask({
                  title: "Reject proof of payment?",
                  body: `The proof submitted for ${b.id} (${b.guestName}) will be rejected and the guest must upload a new one. This cannot be undone.`,
                  confirmLabel: "Reject proof",
                  danger: true,
                  run: () => {
                    dispatch({
                      type: "VERIFY_PAYMENT",
                      id: b.id,
                      approved: false,
                      by: actor,
                    })
                    setMsg("Proof rejected. Guest must upload a new one.")
                  },
                })
              }
            >
              Reject proof
            </Button>
          </div>
        )}
        {cash && b.status === "pending" && toCollect > 0 && (
          <Button
            onClick={() =>
              ask({
                title: "Collect payment at the counter?",
                body: `Record ${peso(toCollect)} cash received from ${b.guestName} for booking ${b.id} (${prettyDate(b.date)}, ${slotName(state, b.slotId)}). A receipt will be issued and this cannot be undone.`,
                confirmLabel: `Collect ${peso(toCollect)}`,
                run: () => {
                  dispatch({
                    type: "COLLECT_PAYMENT",
                    id: b.id,
                    amount: toCollect,
                    by: actor,
                  })
                  setMsg(
                    `Collected ${peso(toCollect)}. Status saved (Pending to ${
                      b.dueNow !== undefined && b.dueNow < b.total
                        ? "Reserved"
                        : "Confirmed"
                    }).`,
                  )
                },
              })
            }
          >
            <Banknote size={18} /> Collect {peso(toCollect)} at counter
          </Button>
        )}
        {cash &&
          (b.status === "reserved" || b.status === "confirmed") &&
          balanceOf(b) > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {(["cash", "gcash"] as const).map((m) => (
                <Button
                  key={m}
                  variant="secondary"
                  onClick={() =>
                    ask({
                      title: `Collect remaining balance by ${m === "cash" ? "cash" : "GCash"}?`,
                      body: `Record ${peso(balanceOf(b))} received via ${m === "cash" ? "cash" : "GCash"} from ${b.guestName} for booking ${b.id}. The official receipt replaces the RESERVED receipt and this cannot be undone.`,
                      confirmLabel: `Collect ${peso(balanceOf(b))}`,
                      run: () => {
                        dispatch({
                          type: "COLLECT_PAYMENT",
                          id: b.id,
                          amount: balanceOf(b),
                          by: actor,
                          method: m,
                        })
                        setMsg(
                          "Balance collected. Official receipt issued; status is now Confirmed.",
                        )
                      },
                    })
                  }
                >
                  <Banknote size={18} /> Balance by {m === "cash" ? "Cash" : "GCash"} {peso(balanceOf(b))}
                </Button>
              ))}
            </div>
          )}
        {showReminder && (
          <Button
            variant="secondary"
            onClick={() =>
              ask({
                title: "Send reminder?",
                body: `A reminder will be sent to ${b.guestName}${
                  b.phone ? ` (${b.phone})` : ""
                } for booking ${b.id} on ${prettyDate(b.date)}, ${slotName(state, b.slotId)}, asking them to confirm attendance.`,
                confirmLabel: "Send reminder",
                run: () => {
                  dispatch({ type: "SEND_REMINDER", id: b.id, by: actor })
                  setMsg(
                    "Reminder sent. Ask the guest to confirm attendance or call by phone.",
                  )
                },
              })
            }
          >
            <BellRing size={18} />
            {b.reminderSentAt
              ? "Send another reminder"
              : "Send reminder / confirm attendance"}
          </Button>
        )}
        {canCancelUnconfirmed && (
          <Button variant="danger" onClick={() => setConfirm("cancel")}>
            Cancel: no confirmation, keep deposit
          </Button>
        )}
        {canNoShow && (
          <Button variant="danger" onClick={() => setConfirm("noshow")}>
            Mark as no-show (payment kept as deposit)
          </Button>
        )}
        {openStatus && (
          <Link to={`/staff/qr?code=${b.id}`}>
            <Button variant="ghost" className="w-full">
              <QrCode size={18} /> Open in QR verification
            </Button>
          </Link>
        )}
      </div>
      {ended && openStatus && (
        <p className="text-xs text-slate-500">
          This slot has ended and the guest never checked in.
        </p>
      )}
      {dialog}
      <ConfirmDialog
        danger
        closeOnConfirm
        open={confirm === "cancel"}
        title="Cancel this reservation?"
        message={`${b.guestName}'s booking ${b.id} will be cancelled and the ${peso(b.paid)} already paid is kept as deposit. This cannot be undone.`}
        confirmLabel="Cancel reservation"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          dispatch({
            type: "PROCESS_CANCEL",
            id: b.id,
            by: actor,
            eligible: false,
            amount: b.paid,
            reason: "No confirmation of attendance; payment kept as deposit",
          })
          setMsg("Cancelled for no confirmation. Payment kept as deposit.")
        }}
      />
      <ConfirmDialog
        danger
        closeOnConfirm
        open={confirm === "noshow"}
        title="Mark as no-show?"
        message={`${b.guestName} never checked in for ${b.id}. Payment is kept as deposit and the slot is released. This cannot be undone.`}
        confirmLabel="Mark no-show"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          dispatch({ type: "MARK_NO_SHOW", id: b.id })
          setMsg(
            "Marked as no-show. Payment kept; guest refund request available in 3–5 business days.",
          )
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 3. Cottage reservations                                             */
/* ------------------------------------------------------------------ */

const kindForSlot = (slotId: string): Cottage["kind"] =>
  slotId === "room-stay" ? "room" : slotId === "event" ? "event" : "cottage"

export function CottageReservationsPage() {
  const { state } = useTampisaw()
  const [date, setDate] = useState(todayISO())
  const [slotId, setSlotId] = useState("day-tour")
  const [kind, setKind] = useState<Cottage["kind"] | "all">("cottage")
  const [selected, setSelected] = useState<string | null>(null)

  const closed = new Date(`${date}T12:00:00`).getDay() === 2
  const items = state.cottages.filter((c) => kind === "all" || c.kind === kind)
  const bookingsFor = (c: Cottage) =>
    state.bookings.filter(
      (b) =>
        b.cottageId === c.id &&
        b.date === date &&
        (c.kind === "room" || canon(b.slotId) === canon(slotId)) &&
        isActive(b),
    )
  const units = items.flatMap((c) =>
    Array.from({ length: unitsOf(c) }, (_, i) => ({ c, i })),
  )
  const code = (c: Cottage) =>
    String.fromCharCode(65 + state.cottages.findIndex((x) => x.id === c.id))
  const selectedBooking = state.bookings.find((b) => b.id === selected)

  return (
    <StaffLayout>
      <PageTitle
        eyebrow="Cottage reservations"
        title="Cottage grid"
        description="Pick a day and slot to see which cottages, rooms and pavilions are available, reserved or in use."
      />
      <Card className="mb-6 p-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Select
            label="Slot"
            value={slotId}
            onChange={(e) => {
              setSlotId(e.target.value)
              setKind(kindForSlot(e.target.value))
            }}
          >
            {state.slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.time})
              </option>
            ))}
          </Select>
          <Select
            label="Show"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="all">All cottages, rooms and pavilions</option>
            <option value="cottage">Cottages</option>
            <option value="room">Rooms</option>
            <option value="event">Pavilions</option>
          </Select>
        </div>
      </Card>
      {closed && (
        <div className="mb-5">
          <Note tone="warning">
            The resort is closed on Tuesdays; nothing can be reserved for this
            date.
          </Note>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {units.map(({ c, i }) => {
          const b = bookingsFor(c)[i]
          const blocked = !b && unitAvailability(state, c, date, slotId).blockedBy
          const maintenance = c.status === "maintenance"
          const status = maintenance
            ? "Maintenance"
            : b
              ? LIVE.includes(b.status)
                ? "In use"
                : "Reserved"
              : "Available"
          const tone =
            status === "Available"
              ? "green"
              : "red"
          return (
            <Card key={`${c.id}-${i}`} className="flex flex-col overflow-hidden">
              <div className="flex items-start justify-between gap-3 p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 place-items-center rounded-xl bg-aqua-600 text-xl font-extrabold text-white">
                    {code(c)}
                  </span>
                  <div>
                    <p className="font-extrabold text-ink-900">
                      {c.name}
                      {unitsOf(c) > 1 ? ` #${i + 1}` : ""}
                    </p>
                    <p className="text-xs text-slate-500">
                      Capacity {c.capacity} · {peso(c.price)}
                    </p>
                  </div>
                </div>
                <Badge tone={tone}>{status}</Badge>
              </div>
              <div className="flex-1 border-t border-slate-100 bg-sand-50 px-5 py-4 text-sm">
                {b ? (
                  <>
                    <p className="font-bold text-ink-900">{b.guestName}</p>
                    <p className="text-xs text-slate-500">
                      {b.guests} pax ·{" "}
                      {b.source === "walk-in" ? "Walk-in" : "Online"} ·{" "}
                      {b.paid >= b.total ? "Paid" : "RESERVED"}
                    </p>
                  </>
                ) : (
                  <p className="text-slate-500">
                    {maintenance ? "Under maintenance." : blocked || "No guest assigned."}
                  </p>
                )}
              </div>
              <div className="p-4">
                {b ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setSelected(b.id)}
                  >
                    View details
                  </Button>
                ) : maintenance || closed || blocked ? (
                  <Button variant="secondary" className="w-full" disabled>
                    Unavailable
                  </Button>
                ) : (
                  <Link
                    to={`/staff/walk-in?cottage=${c.id}&date=${date}&slot=${slotId}`}
                  >
                    <Button className="w-full">
                      Walk-in entry (30% downpayment)
                    </Button>
                  </Link>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <Modal
        open={!!selectedBooking}
        title="Reservation details"
        onClose={() => setSelected(null)}
      >
        {selectedBooking && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={selectedBooking.status} />
              {sourceBadge(selectedBooking)}
            </div>
            <div className="rounded-xl bg-sand-50 px-4">
              <Row label="Guest">{selectedBooking.guestName}</Row>
              <Row label="Booking">{selectedBooking.id}</Row>
              <Row label="Item">
                {itemName(state, selectedBooking.cottageId)}
              </Row>
              <Row label="Source">
                {selectedBooking.source === "walk-in" ? "Walk-in" : "Online"}
              </Row>
              <Row label="Payment">
                {selectedBooking.paid >= selectedBooking.total
                  ? "Paid (official receipt)"
                  : "RESERVED (downpayment)"}
              </Row>
              <Row label="Balance due">{peso(balanceOf(selectedBooking))}</Row>
              <Row label="Payment option">{paymentOptionLabel(selectedBooking.paymentOption)}</Row>
              {selectedBooking.cancelReason && <Row label="Cancel reason">{selectedBooking.cancelReason}</Row>}
              <Row label="Time in / out">
                {timeInOf(selectedBooking)} / {timeOutOf(selectedBooking)}
              </Row>
            </div>
            <Link to={`/staff/qr?code=${selectedBooking.id}`}>
              <Button className="w-full">
                <QrCode size={18} /> Verify at gate
              </Button>
            </Link>
          </div>
        )}
      </Modal>
    </StaffLayout>
  )
}

/* ------------------------------------------------------------------ */
/* 4. QR verification                                                  */
/* ------------------------------------------------------------------ */

const norm = (s: string) => s.replace(/[^a-z0-9]/gi, "").toUpperCase()

type DetectorCtor = new (opts: { formats: string[] }) => {
  detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]>
}

function CameraScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [on, setOn] = useState(false)
  const [error, setError] = useState("")
  const [issue, setIssue] = useState(false)

  const scanPhoto = async (file: File) => {
    setError("")
    if (!/^image\/(jpeg|png)$/i.test(file.type)) {
      setError("Only JPG, JPEG or PNG photos are accepted.")
      return
    }
    const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
    if (!Detector) {
      setError("This browser cannot read QR codes from a photo. Type the reservation code instead.")
      return
    }
    try {
      const bitmap = await createImageBitmap(file)
      const found = await new Detector({ formats: ["qr_code"] }).detect(bitmap as unknown as HTMLVideoElement)
      if (found[0]?.rawValue) onCode(found[0].rawValue)
      else setError("No QR code found in that photo. Try again closer, or type the code.")
    } catch {
      setError("That photo could not be read. Try again, or type the reservation code.")
    }
  }

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setOn(false)
  }
  useEffect(
    () => () => streamRef.current?.getTracks().forEach((t) => t.stop()),
    [],
  )

  useEffect(() => {
    if (!on) return
    const Detector = (window as unknown as { BarcodeDetector?: DetectorCtor })
      .BarcodeDetector
    if (!Detector) {
      setError(
        "This browser cannot read QR codes from the camera. Type the code instead.",
      )
      return
    }
    const detector = new Detector({ formats: ["qr_code"] })
    const timer = window.setInterval(async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return
      try {
        const found = await detector.detect(video)
        if (found[0]?.rawValue) {
          onCode(found[0].rawValue)
          stop()
        }
      } catch {
        /* keep trying */
      }
    }, 450)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on])

  const start = async () => {
    setError("")
    const result = await openCamera("environment")
    if ("issue" in result) {
      setIssue(true)
      setError(cameraMessage(result.issue, "scan a photo of the QR code or type the reservation code"))
      return
    }
    setIssue(false)
    streamRef.current = result.stream
    setOn(true)
    requestAnimationFrame(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = result.stream
        void videoRef.current.play().catch(() => {})
      }
    })
  }

  return (
    <div>
      {on ? (
        <div className="relative overflow-hidden rounded-xl bg-ink-950">
          <div aria-hidden="true" className="scan-line" />
          <video
            ref={videoRef}
            className="aspect-video w-full object-cover"
            muted
            playsInline
            autoPlay
          />
        </div>
      ) : (
        <div className="grid aspect-video place-items-center rounded-xl border-2 border-dashed border-aqua-200 bg-aqua-50/50 text-center text-sm text-slate-500">
          <div>
            <Camera className="mx-auto mb-2 text-aqua-600" size={28} />
            Camera is off
          </div>
        </div>
      )}
      <Button
        variant="secondary"
        className="mt-3 w-full"
        onClick={on ? stop : start}
      >
        <Camera size={18} /> {on ? "Stop camera" : "Scan with camera"}
      </Button>
      {error && (
        <p className="mt-2 text-xs font-medium text-warning-700">{error}</p>
      )}
      {issue && <OpenInNewTabButton className="mt-2 w-full" />}
      {issue && (
        <label className="mt-2 block cursor-pointer rounded-xl bg-ink-900 px-4 py-2.5 text-center text-sm font-bold text-white">
          Take photo with your device camera
          <input
            type="file"
            accept="image/png,image/jpeg,.jpg,.jpeg,.png"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void scanPhoto(f)
              e.target.value = ""
            }}
          />
        </label>
      )}
    </div>
  )
}

export function QrVerificationPage() {
  const { state, dispatch, currentUser } = useTampisaw()
  const cash = canHandleCash(currentUser?.role)
  const { ask, dialog } = useConfirm()
  const actor = useActor()
  const [params] = useSearchParams()
  const initial = params.get("code") ?? ""
  const [input, setInput] = useState(initial)
  const [scanned, setScanned] = useState<string | null>(initial || null)
  const [nameQuery, setNameQuery] = useState("")
  const [override, setOverride] = useState(false)
  const [msg, setMsg] = useState("")
  const [tokenBookingId, setTokenBookingId] = useState<string | null>(null)
  const [tokenChecked, setTokenChecked] = useState(false)
  const [demoToken, setDemoToken] = useState("")
  const [waiverAck, setWaiverAck] = useState(false)
  const [checkout, setCheckout] = useState<{
    at: number
    returned: boolean
  } | null>(null)
  const today = todayISO()
  const [justCheckedId, setJustCheckedId] = useState<string | null>(null)
  const [manualQuery, setManualQuery] = useState("")
  const [syncToast, setSyncToast] = useState("")
  const clearToast = useCallback(() => setSyncToast(""), [])
  const { muted, toggle: toggleMute } = useGateMute()
  const { online, pending: pendingSync } = useOfflineSync((n) =>
    setSyncToast(`Back online. ${n} offline check-in${n === 1 ? "" : "s"} synced.`),
  )

  const isToken = !!scanned && /^[0-9a-f]{64}$/i.test(scanned.trim())

  const lookup = async (code: string) => {
    const c = code.trim()
    setScanned(c)
    setInput(c)
    setOverride(false)
    setWaiverAck(false)
    setMsg("")
    setTokenBookingId(null)
    setTokenChecked(false)
    setDemoToken("")
    if (/^[0-9a-f]{64}$/i.test(c)) {
      const verified = await verifyQrToken(c, state.bookings)
      setTokenBookingId(verified?.id ?? null)
      setTokenChecked(true)
    }
  }
  const booking = scanned
    ? isToken
      ? state.bookings.find((b) => b.id === tokenBookingId)
      : state.bookings.find((b) => norm(b.id) === norm(scanned))
    : undefined
  const tampered = isToken && tokenChecked && !tokenBookingId

  // Manual entry (no scanned QR): sign on the fly so the demo flow still works.
  useEffect(() => {
    let live = true
    if (booking && !isToken)
      signQrToken(booking).then((t) => live && setDemoToken(t))
    return () => {
      live = false
    }
  }, [booking?.id, isToken])
  const todayCodes = state.bookings
    .filter((b) => b.date === today && isActive(b) && !LIVE.includes(b.status))
    .slice(0, 5)

  const nameMatches = useMemo(() => {
    const q = (nameQuery || scanned || "").trim()
    if (q.length < 2) return []
    return state.bookings.filter((b) => matchesBooking(b, q)).slice(0, 6)
  }, [state.bookings, nameQuery, scanned])

  // Time / date warnings
  let timeIssue = ""
  if (booking) {
    if (booking.date < today)
      timeIssue = `This booking was for ${prettyDate(booking.date)}. The date has passed.`
    else if (booking.date > today)
      timeIssue = `This booking is for ${prettyDate(booking.date)}, not today.`
    else if (slotEnded(booking)) timeIssue = "Today's slot has already ended."
    else if (slotStart(booking).getTime() - Date.now() > 3_600_000)
      timeIssue = `The slot starts at ${slotStart(booking).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. The guest is early.`
  }

  const used = booking && LIVE.includes(booking.status)
  const dead =
    booking &&
    (DEAD.includes(booking.status) ||
      booking.status === "cancellation-requested")
  const unpaid = booking && booking.status === "pending"
  const balance = booking ? balanceOf(booking) : 0
  const checkedIn = booking?.status === "checked-in"
  const braceletsIssued = (booking?.bracelets ?? []).filter((x) => !x.voided)
  const waiverFlagged = !!booking?.waiver?.flagged
  const yesAnswers = booking?.waiver
    ? healthQuestions.filter((q) => booking.waiver?.health[q.id])
    : []
  const overtimeQuote =
    booking && checkout && booking.checkedInAtISO
      ? computeOvertime(
          state.tariff,
          booking,
          new Date(checkout.at),
          new Date(
            new Date(booking.checkedInAtISO).getTime() +
              (booking.sessionMinutes ?? sessionMinutesFor(booking.slotId)) *
                60_000,
          ),
          !!booking.cottageId,
        )
      : null

  // Gate outcome shown on the big result screen.
  const gate: { kind: GateKind; word: string; detail?: string } | null = (() => {
    if (!scanned || (isToken && !tokenChecked)) return null
    if (!booking)
      return tampered
        ? { kind: "invalid", word: "Invalid", detail: "Signature check failed. Do not admit." }
        : { kind: "invalid", word: "Not found", detail: `No booking matches "${scanned}".` }
    if (booking.id === justCheckedId && checkedIn) return { kind: "valid", word: "Checked in", detail: "Issue bracelets below." }
    if (checkedIn || used) return { kind: "invalid", word: "Already used", detail: "This code was already scanned. Do not admit again." }
    if (dead)
      return {
        kind: "invalid",
        word: booking.status === "expired" ? "Expired" : booking.status === "cancellation-requested" ? "On hold" : booking.status === "no-show" ? "No-show" : "Cancelled",
        detail: "Do not admit. Refer to Payments & refunds.",
      }
    if (unpaid) return { kind: "warning", word: "Unpaid", detail: "Payment is pending. Settle it below before entry." }
    if (balance > 0) return { kind: "warning", word: "Balance due", detail: `${peso(balance)} to collect before entry.` }
    if (timeIssue) return { kind: "warning", word: "Check time", detail: timeIssue }
    if (!booking.waiver) return { kind: "warning", word: "No waiver", detail: "Have the guest sign at the desk." }
    if (waiverFlagged) return { kind: "warning", word: "Health flag", detail: "Review the flagged health answers below." }
    return { kind: "valid", word: "Valid", detail: isToken ? "Signature verified." : undefined }
  })()
  const gateKey = gate ? `${scanned}|${booking?.id ?? "-"}|${gate.word}` : ""
  useEffect(() => {
    if (gate) gateFeedback(gate.kind, muted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateKey])
  const doCheckIn = (b: Booking) => {
    dispatch({ type: "CHECK_IN", id: b.id })
    setJustCheckedId(b.id)
    if (!online)
      dispatch({
        type: "QUEUE_SYNC",
        item: { id: `SYNC-${Date.now()}`, bookingId: b.id, guestName: b.guestName, kind: "check-in", at: new Date().toISOString(), by: actor },
      })
  }
  const resetScan = () => {
    setScanned(null)
    setInput("")
    setNameQuery("")
    setManualQuery("")
    setOverride(false)
    setWaiverAck(false)
    setMsg("")
    setTokenBookingId(null)
    setTokenChecked(false)
    setDemoToken("")
    setJustCheckedId(null)
  }
  const manualResults = useMemo(
    () => (manualQuery.trim().length < 2 ? [] : state.bookings.filter((b) => matchesBooking(b, manualQuery)).slice(0, 8)),
    [state.bookings, manualQuery],
  )

  return (
    <StaffLayout>
      {!online && <OfflineBanner />}
      {syncToast && <Toast message={syncToast} onDone={clearToast} />}
      <PageTitle
        eyebrow="QR code verification"
        title="Check in a guest"
        description="Scan or type the reservation code, settle any balance, confirm check-in and issue bracelets."
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <MuteToggle muted={muted} onToggle={toggleMute} />
        {pendingSync.length > 0 && (
          <span className="rounded-full bg-warning-100 px-3 py-2 text-sm font-extrabold text-warning-900">{pendingSync.length} pending sync</span>
        )}
      </div>
      {gate && (
        <div className="mb-6">
          <GateResultScreen
            kind={gate.kind}
            word={gate.word}
            guestName={booking?.guestName}
            pax={booking?.guests}
            service={booking ? itemName(state, booking.cottageId) : undefined}
            detail={gate.detail}
            actionLabel={gate.kind === "valid" && booking && !checkedIn ? "Check in now" : undefined}
            onAction={booking ? () => doCheckIn(booking) : undefined}
            onReset={resetScan}
          />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (input.trim()) void lookup(input)
              }}
              className="space-y-3"
            >
              <Input
                label="Scanned token or booking ID"
                placeholder="e.g. TMP-1054 or the signed QR token"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <Button type="submit" className="w-full">
                <QrCode size={18} /> Verify code
              </Button>
            </form>
            <div className="mt-4">
              <CameraScanner onCode={(c) => void lookup(c)} />
            </div>
            {todayCodes.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-400">
                  Today's reservations
                </p>
                <div className="flex flex-wrap gap-2">
                  {todayCodes.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => void lookup(b.id)}
                      className="rounded-full border border-aqua-200 bg-aqua-50 px-3 py-1.5 text-xs font-bold text-aqua-800 hover:bg-aqua-100"
                    >
                      {b.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>
          <ManualLookup
            query={manualQuery}
            onQuery={setManualQuery}
            results={manualResults}
            onPick={(b) => void lookup(b.id)}
            describe={(b) => `${b.id} · ${prettyDate(b.date)} · ${b.guests} pax`}
          />
          <SyncPanel />
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-ink-900">
              <Clock3 size={16} className="text-aqua-700" /> Recent scans
            </h2>
            {state.scanHistory.length === 0 ? (
              <p className="text-sm text-slate-500">No scans yet.</p>
            ) : (
              <ul className="space-y-2 text-xs text-slate-600">
                {state.scanHistory.slice(0, 8).map((s, i) => (
                  <li
                    key={`${s}-${i}`}
                    className="rounded-lg bg-sand-50 px-3 py-2"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          {!scanned && (
            <Card className="grid min-h-72 place-items-center p-8 text-center">
              <div>
                <QrCode className="mx-auto mb-3 text-aqua-500" size={40} />
                <p className="font-extrabold text-ink-900">
                  Waiting for a code
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Scan the guest's QR or type the code to look up the
                  reservation.
                </p>
              </div>
            </Card>
          )}

          {scanned && isToken && !tokenChecked && (
            <Card className="p-6 text-sm text-slate-500">
              Verifying signature...
            </Card>
          )}

          {scanned && !booking && (isToken ? tokenChecked : true) && (
            <Card className="space-y-4 p-6">
              <Note tone="danger">
                {tampered ? (
                  <>
                    <strong>Signature check failed. Do not admit.</strong> This
                    QR token was altered or copied from another booking. Ask the
                    guest for the code in their confirmation email, or find the
                    booking below.
                  </>
                ) : (
                  <>
                    <strong>Invalid code "{scanned}".</strong> Ask the guest for
                    the correct code, or look up the booking by name, email or
                    mobile below.
                  </>
                )}
              </Note>
              <Input
                label="Search by name, email, mobile or booking ID"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="Guest name"
              />
              {nameMatches.length > 0 ? (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {nameMatches.map((b) => (
                    <li key={b.id}>
                      <button
                        onClick={() => void lookup(b.id)}
                        className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-aqua-50"
                      >
                        <span>
                          <span className="block text-sm font-extrabold">
                            {b.guestName}
                          </span>
                          <span className="text-xs text-slate-500">
                            {b.id} · {prettyDate(b.date)}
                          </span>
                        </span>
                        <StatusBadge status={b.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">
                  Type at least 2 letters to search bookings.
                </p>
              )}
            </Card>
          )}

          {booking && (
            <Card className="space-y-4 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                    Reservation
                  </p>
                  <h2 className="text-2xl font-extrabold text-ink-900">
                    {booking.guestName}
                  </h2>
                </div>
                <div className="flex gap-2">
                  <StatusBadge status={booking.status} />
                  {sourceBadge(booking)}
                </div>
              </div>

              {used && !checkedIn && (
                <Note tone="danger">
                  <strong>Code already used.</strong> Do not admit again.
                </Note>
              )}
              {isToken && (
                <Note tone="success">
                  <strong>Signature verified.</strong> The QR token matches this
                  booking.
                </Note>
              )}
              {checkedIn && (
                <Note tone="success">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Checked in at {timeInOf(booking)}
                      {booking.checkedInAtISO
                        ? ` (${new Date(booking.checkedInAtISO).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })})`
                        : ""}
                      .
                      {isToken &&
                        " If this guest is arriving now, the QR may be a copy: confirm identity."}
                    </span>
                    <LiveSessionTimer
                      booking={booking}
                      tariffAlertMinutes={state.tariff.expiryAlertMinutes}
                      onAlert={() =>
                        dispatch({ type: "EXPIRY_ALERT", id: booking.id })
                      }
                    />
                  </div>
                </Note>
              )}
              {dead && (
                <Note tone="danger">
                  <strong>
                    {booking.status === "cancellation-requested"
                      ? "Cancellation requested."
                      : `Reservation is ${booking.status.replace("-", " ")}.`}
                  </strong>{" "}
                  Do not admit. Refer to Payments & refunds or Appointments.
                </Note>
              )}
              {!used && !dead && timeIssue && (
                <Note tone="warning">{timeIssue}</Note>
              )}

              <div className="rounded-xl bg-sand-50 px-4">
                <Row label="Booking code">{booking.id}</Row>
                <Row label="Date & slot">
                  {prettyDate(booking.date)} · {slotName(state, booking.slotId)}
                </Row>
                {arrivalLabel(booking) && (
                  <Row label="Arrival">{arrivalLabel(booking)}</Row>
                )}
                <Row label="Service">
                  {itemName(state, booking.cottageId)} · {booking.guests} pax
                </Row>
                <Row label="Payment status">
                  {payBadge(booking)} {peso(booking.paid)} /{" "}
                  {peso(booking.total)}
                </Row>
                {booking.overtime && booking.overtime.fee > 0 && (
                  <Row label="Overtime surcharge">
                    {peso(booking.overtime.fee)} ({booking.overtime.billedHours}
                    h billed, {booking.overtime.minutesOver} min over)
                  </Row>
                )}
                <Row label="Balance due">{peso(balance)}</Row>
                <Row label="Source">
                  {booking.source === "walk-in" ? "Walk-in" : "Online"}
                </Row>
                <Row label="Receipt">
                  {booking.receipt === "official"
                    ? "Official receipt"
                    : booking.receipt === "reserved"
                      ? "RESERVED receipt"
                      : "None yet"}
                </Row>
              </div>

              {!isToken && (
                <p className="text-xs text-slate-500">
                  Manual entry, no QR scanned.{" "}
                  {demoToken
                    ? `Verified by reservation code (signed token ${demoToken.slice(0, 22)}...).`
                    : "Preparing the signed check-in token..."}
                </p>
              )}

              {booking.waiver ? (
                waiverFlagged ? (
                  <Note tone="danger">
                    <strong>
                      Health declaration flagged. Verify before entry.
                    </strong>
                    <ul className="mt-1 list-disc pl-5">
                      {yesAnswers.map((q) => (
                        <li key={q.id}>
                          Answered Yes: {q.label}
                          {q.id === "other" && booking.waiver?.healthOther
                            ? ` (${booking.waiver.healthOther})`
                            : ""}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs">
                      Waiver {booking.waiver.version}, signed{" "}
                      {prettyDateTime(booking.waiver.acceptedAt)}.
                    </p>
                  </Note>
                ) : (
                  <Note tone="success">
                    Waiver accepted {prettyDateTime(booking.waiver.acceptedAt)}{" "}
                    ({booking.waiver.version}). All health answers were No.
                  </Note>
                )
              ) : (
                <Note tone="warning">
                  No signed waiver on file for this booking. Have the guest sign
                  at the desk before entry.
                </Note>
              )}

              {msg && <Note tone="success">{msg}</Note>}

              {!used && !dead && (
                <div className="space-y-3">
                  {unpaid && (
                    <Note tone="warning">
                      <strong>Payment pending.</strong> The booking must be paid
                      before check-in.
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!cash && <CashNote />}
                        {cash && booking.paymentStatus === "submitted" && booking.staffApproval && !isAdminRole(currentUser?.role) && (
                          <span className="text-xs font-bold text-warning-800">Awaiting admin confirmation</span>
                        )}
                        {cash && booking.paymentStatus === "submitted" && (!booking.staffApproval || isAdminRole(currentUser?.role)) && (
                          <Button
                            onClick={() =>
                              ask({
                                title: "Approve proof of payment?",
                                body: isAdminRole(currentUser?.role) ? `Booking ${booking.id} for ${booking.guestName} will be marked paid. Only continue if the money is really in your account.` : `Booking ${booking.id} stays pending until the admin confirms the money arrived.`,
                                confirmLabel: "Approve proof",
                                run: () => {
                                  dispatch({
                                    type: "VERIFY_PAYMENT",
                                    id: booking.id,
                                    approved: true,
                                    by: actor,
 byRole: currentUser?.role,
                                  })
                                  setMsg("Proof of payment verified.")
                                },
                              })
                            }
                          >
                            {isAdminRole(currentUser?.role) ? "Confirm payment received" : "Send proof to admin"}
                          </Button>
                        )}
                        {cash && (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              const amount = Math.max(
                                0,
                                (booking.dueNow ?? booking.total) -
                                  booking.paid,
                              )
                              ask({
                                title: "Collect payment at the counter?",
                                body: `Record ${peso(amount)} cash received from ${booking.guestName} for booking ${booking.id}. A receipt will be issued and this cannot be undone.`,
                                confirmLabel: `Collect ${peso(amount)}`,
                                run: () => {
                                  dispatch({
                                    type: "COLLECT_PAYMENT",
                                    id: booking.id,
                                    amount,
                                    by: actor,
                                  })
                                  setMsg(
                                    `Collected ${peso(amount)} at the counter.`,
                                  )
                                },
                              })
                            }}
                          >
                            Collect{" "}
                            {peso(
                              Math.max(
                                0,
                                (booking.dueNow ?? booking.total) -
                                  booking.paid,
                              ),
                            )}{" "}
                            now
                          </Button>
                        )}
                      </div>
                    </Note>
                  )}

                  {!unpaid && balance > 0 && (
                    <Note tone="warning">
                      <strong>Balance due: {peso(balance)}.</strong> Collect the
                      remaining balance and issue the official receipt (replaces
                      the RESERVED receipt).
                      <div className="mt-3">
                        {cash ? (
                          <div className="flex flex-wrap gap-2">
                            {(["cash", "gcash"] as const).map((m) => (
                              <Button
                                key={m}
                                variant={m === "cash" ? "primary" : "secondary"}
                                onClick={() =>
                                  ask({
                                    title: `Collect remaining balance by ${m === "cash" ? "cash" : "GCash"}?`,
                                    body: `Record ${peso(balance)} received via ${m === "cash" ? "cash" : "GCash"} from ${booking.guestName} for booking ${booking.id}. The official receipt replaces the RESERVED receipt and this cannot be undone.`,
                                    confirmLabel: `Collect ${peso(balance)}`,
                                    run: () => {
                                      dispatch({
                                        type: "COLLECT_PAYMENT",
                                        id: booking.id,
                                        amount: balance,
                                        by: actor,
                                        method: m,
                                      })
                                      setMsg(
                                        "Balance collected. Official receipt issued, replacing the RESERVED receipt.",
                                      )
                                    },
                                  })
                                }
                              >
                                <Banknote size={18} /> Pay by {m === "cash" ? "Cash" : "GCash"} {peso(balance)}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <CashNote />
                        )}
                      </div>
                    </Note>
                  )}

                  {timeIssue && (
                    <label className="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50/60 p-3 text-sm font-semibold text-warning-900">
                      <input
                        type="checkbox"
                        className="mt-1 size-4"
                        checked={override}
                        onChange={(e) => setOverride(e.target.checked)}
                      />
                      I checked with the guest and want to admit despite the
                      schedule warning.
                    </label>
                  )}

                  {waiverFlagged && (
                    <label className="flex items-start gap-3 rounded-xl border border-danger-200 bg-danger-50/60 p-3 text-sm font-semibold text-danger-900">
                      <input
                        type="checkbox"
                        className="mt-1 size-4"
                        checked={waiverAck}
                        onChange={(e) => setWaiverAck(e.target.checked)}
                      />
                      I reviewed the flagged health answers with the guest and
                      they are fit to swim.
                    </label>
                  )}

                  <Button
                    className="w-full"
                    disabled={
                      unpaid ||
                      balance > 0 ||
                      (!!timeIssue && !override) ||
                      (waiverFlagged && !waiverAck)
                    }
                    onClick={() =>
                      ask({
                        title: "Confirm check-in?",
                        body: `Check in ${booking.guestName} (${booking.id}, ${booking.guests} guests) for ${prettyDate(booking.date)}, ${slotName(state, booking.slotId)}. The code will be marked as used and the session timer starts.`,
                        confirmLabel: "Check in",
                        run: () => {
                          doCheckIn(booking)
                          setMsg(
                            "Checked in. Now issue tamper-evident bracelets.",
                          )
                        },
                      })
                    }
                  >
                    <CheckCircle2 size={18} /> Confirm check-in
                  </Button>
                  {(unpaid || balance > 0) && (
                    <p className="text-center text-xs text-slate-500">
                      Settle the payment above to unlock check-in.
                    </p>
                  )}
                </div>
              )}

              {checkedIn && (
                <div className="space-y-3 rounded-xl border border-aqua-200 bg-aqua-50/50 p-4">
                  <h3 className="flex items-center gap-2 font-extrabold text-ink-900">
                    <Watch size={18} className="text-aqua-700" /> Tamper-evident
                    bracelets
                  </h3>
                  {braceletsIssued.length === 0 ? (
                    <Button
                      onClick={() =>
                        ask({
                          title: "Issue bracelets?",
                          body: `Issue ${booking.guests} bracelet${
                            booking.guests === 1 ? "" : "s"
                          } to ${booking.guestName} (${booking.id}) and record time in now. This cannot be undone.`,
                          confirmLabel: "Issue bracelets",
                          run: () => {
                            dispatch({
                              type: "ISSUE_BRACELETS",
                              id: booking.id,
                              by: actor,
                            })
                            setMsg(
                              "Bracelets issued, one per guest. Time in recorded.",
                            )
                          },
                        })
                      }
                    >
                      Issue {booking.guests} bracelet
                      {booking.guests === 1 ? "" : "s"} and record time in
                    </Button>
                  ) : (
                    <>
                      <p className="text-sm text-slate-600">
                        {braceletsIssued.length} issued. Time in:{" "}
                        <strong>{timeInOf(booking)}</strong>
                      </p>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {braceletsIssued.map((x) => (
                          <li
                            key={x.serial}
                            className="rounded-lg bg-white px-3 py-2 text-xs shadow-sm"
                          >
                            <span className="block font-extrabold text-ink-900">
                              {x.serial}
                            </span>
                            <span className="text-slate-500">{x.color}</span>
                          </li>
                        ))}
                      </ul>
                      <Link
                        to="/staff/bracelets"
                        className="inline-block text-sm font-bold text-aqua-800 underline"
                      >
                        Open Bracelets & time out
                      </Link>
                    </>
                  )}
                </div>
              )}

              {checkedIn && (
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() =>
                    setCheckout({ at: Date.now(), returned: true })
                  }
                >
                  <Clock3 size={18} /> Check out guest
                </Button>
              )}
            </Card>
          )}
        </div>
      </div>
      <Modal
        open={!!checkout && !!booking}
        title="Check out and settle"
        onClose={() => setCheckout(null)}
      >
        {booking && checkout && overtimeQuote && (
          <div className="space-y-4">
            <div className="rounded-xl bg-sand-50 px-4">
              <Row label="Guest">
                {booking.guestName} · {booking.id}
              </Row>
              <Row label="Checked in">{timeInOf(booking)}</Row>
              <Row label="Grace period">
                {state.tariff.overtime.graceMinutes} min
              </Row>
              <Row label="Minutes over">{overtimeQuote.minutesOver}</Row>
              <Row label="Billed hours">{overtimeQuote.billedHours}</Row>
              <Row label="Overtime surcharge">{peso(overtimeQuote.fee)}</Row>
              <Row label="Balance after checkout">
                {peso(
                  balance + overtimeQuote.fee - (booking.overtime?.fee ?? 0),
                )}
              </Row>
            </div>
            {overtimeQuote.fee > 0 ? (
              <Note tone="warning">
                Overtime is billed in {state.tariff.overtime.blockMinutes}
                -minute blocks after the grace period. The fee is added to the
                booking and the cashier collects the balance.
              </Note>
            ) : (
              <Note tone="success">
                Within the session and grace period. No surcharge.
              </Note>
            )}
            {braceletsIssued.length > 0 && (
              <label className="flex items-center gap-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={checkout.returned}
                  onChange={(e) =>
                    setCheckout({ ...checkout, returned: e.target.checked })
                  }
                />
                All {braceletsIssued.length} bracelets returned
              </label>
            )}
            {overtimeQuote.fee > 0 && !cash && <CashNote />}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={() => setCheckout(null)}>
                Not yet
              </Button>
              <Button
                disabled={overtimeQuote.fee > 0 && !cash}
                onClick={() =>
                  ask({
                    title: "Confirm check-out?",
                    body: `Check out ${booking.guestName} (${booking.id}).${
                      overtimeQuote.fee > 0
                        ? ` An overtime surcharge of ${peso(overtimeQuote.fee)} (${overtimeQuote.minutesOver} min over) will be billed.`
                        : " No overtime is charged."
                    }${
                      braceletsIssued.length > 0 && !checkout.returned
                        ? " Bracelets are recorded as NOT returned."
                        : ""
                    } This cannot be undone.`,
                    confirmLabel: "Check out",
                    danger:
                      overtimeQuote.fee > 0 ||
                      (braceletsIssued.length > 0 && !checkout.returned),
                    run: () => {
                      if (overtimeQuote.fee > 0)
                        dispatch({
                          type: "BILL_OVERTIME",
                          id: booking.id,
                          overtime: {
                            minutesOver: overtimeQuote.minutesOver,
                            billedHours: overtimeQuote.billedHours,
                            fee: overtimeQuote.fee,
                            at: new Date().toISOString(),
                            by: actor,
                          },
                        })
                      dispatch({
                        type: "TIME_OUT",
                        id: booking.id,
                        returned:
                          braceletsIssued.length === 0 || checkout.returned,
                        by: actor,
                      })
                      setMsg(
                        overtimeQuote.fee > 0
                          ? `Checked out. Overtime of ${peso(overtimeQuote.fee)} added; send the guest to the cashier for the balance.`
                          : "Checked out. No overtime charged.",
                      )
                      setCheckout(null)
                    },
                  })
                }
              >
                Confirm check-out
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {dialog}
    </StaffLayout>
  )
}

/* ------------------------------------------------------------------ */
/* 5. Walk-in entry                                                    */
/* ------------------------------------------------------------------ */

type WalkOption = "acquire-now" | "reserve" | "appointment"

type Check = { ok: boolean; reasons: string[] }

function checkAvailability(
  state: AppState,
  f: {
    date: string
    slotId: string
    type: ServiceType
    cottageId?: string
    pax: number
    holdId?: string
    requireOpenNow?: boolean
    /** Guests counted against the unit's own capacity (defaults to pax). */
    itemPax?: number
  },
): Check {
  const reasons: string[] = []
  const today = todayISO()
  if (f.date < today) reasons.push("The date is in the past.")
  if (new Date(`${f.date}T12:00:00`).getDay() === 2)
    reasons.push("The resort is closed on Tuesdays.")
  const slot = state.slots.find((s) => canon(s.id) === canon(f.slotId))
  if (!slot || !slot.active) reasons.push("This slot is not available.")
  const black = state.blackouts.find(
    (b) =>
      b.date === f.date && (!b.slotId || canon(b.slotId) === canon(f.slotId)),
  )
  if (black) reasons.push(`Blocked: ${black.reason}.`)
  if (
    f.requireOpenNow &&
    f.date === today &&
    slotEnded({ date: f.date, slotId: f.slotId })
  )
    reasons.push("This slot has already ended today.")
  if (slot) {
    const used = state.bookings
      .filter(
        (b) =>
          b.date === f.date &&
          canon(b.slotId) === canon(f.slotId) &&
          isActive(b),
      )
      .reduce((s, b) => s + b.guests, 0)
    const held = state.holds
      .filter(
        (h) =>
          h.id !== f.holdId &&
          h.date === f.date &&
          canon(h.slotId) === canon(f.slotId) &&
          new Date(h.expiresAt).getTime() > Date.now(),
      )
      .reduce((s, h) => s + h.guests, 0)
    if (used + held + f.pax > slot.capacity)
      reasons.push(
        `Slot capacity exceeded: ${used + held} of ${slot.capacity} already taken, ${f.pax} requested.`,
      )
  }
  if (f.type !== "pool") {
    const item = state.cottages.find((c) => c.id === f.cottageId)
    if (!item) reasons.push("Choose a cottage, room or pavilion.")
    else {
      if (item.status === "maintenance")
        reasons.push(`${item.name} is under maintenance.`)
      const itemPax = f.itemPax ?? f.pax
      if (item.kind !== "room" && itemPax > item.capacity)
        reasons.push(
          `${item.name} fits ${item.capacity} guests; ${itemPax} requested.`,
        )
      const avail = unitAvailability(state, item, f.date, f.slotId, { holdId: f.holdId })
      if (avail.left <= 0)
        reasons.push(avail.blockedBy ?? `${item.name} is fully booked for this slot.`)
    }
  }
  return { ok: reasons.length === 0, reasons }
}

type Form = {
  name: string
  phone: string
  /** Pool admission only (no cottage, room or pavilion). */
  poolEntry: boolean
  /** Day-tour or night-swim session used for pool and cottage items. */
  slotId: string
  /** Every selected cottage, room or pavilion; one booking is created for each. */
  cottageIds: string[]
  addons: BookingAddon[]
  date: string
  adults: number
  kids: number
  toddlers: number
  eventStart: string
}

type Part = {
  type: ServiceType
  cottageId?: string
  slotId: string
  item?: Cottage
  /** Which of a multi-unit item's units this is (Small Cabana 1, Small Cabana 2). */
  unit?: number
}

/** A selectable option in the walk-in form: a whole item, or one numbered unit of an item that exists several times. */
const unitKey = (item: Cottage, unit: number) => `${item.id}#${unit}`
const splitKey = (key: string): [string, number | undefined] => {
  const [id, n] = key.split("#")
  return [id, n ? Number(n) : undefined]
}

/** The separate bookings a form produces: one per selected item, plus pool entry when chosen. */
function partsOf(state: AppState, f: Form): Part[] {
  const parts: Part[] = []
  for (const key of f.cottageIds) {
    const [id, unit] = splitKey(key)
    const item = state.cottages.find((c) => c.id === id)
    if (!item) continue
    parts.push({
      type: item.kind,
      cottageId: item.id,
      item,
      unit,
      slotId: defaultSlot(item.kind, f.slotId),
    })
  }
  if (f.poolEntry && !parts.some((p) => p.type === "cottage"))
    parts.push({ type: "pool", slotId: defaultSlot("pool", f.slotId) })
  // The booking that carries guests, admission and add-ons: cottage, then pool, then the first item.
  parts.sort(
    (a, b) =>
      Number(b.type === "cottage") - Number(a.type === "cottage") ||
      Number(b.type === "pool") - Number(a.type === "pool"),
  )
  return parts
}

const eventBlocks = [
  "8:00 AM – 12:00 PM",
  "12:00 PM – 4:00 PM",
  "4:00 PM – 8:00 PM",
  "8:00 PM – 12:00 AM",
]

const defaultSlot = (t: ServiceType, current?: string) =>
  t === "room"
    ? "room-stay"
    : t === "event"
      ? "event"
      : current === "night-swim"
        ? "night-swim"
        : "day-tour"

function priceFor(f: Form, parts: Part[]) {
  const rate = f.slotId === "night-swim" ? 300 : 250
  const pax = f.adults + f.kids + f.toddlers
  const lines: [string, number][] = []
  const admission = parts.some((p) => p.type === "pool" || p.type === "cottage")
  const rooms = parts.filter((p) => p.type === "room").length
  if (admission) {
    if (f.adults)
      lines.push([
        `${f.adults} adult${f.adults > 1 ? "s" : ""} x ${peso(rate)}`,
        f.adults * rate,
      ])
    if (f.kids)
      lines.push([
        `${f.kids} kid${f.kids > 1 ? "s" : ""} (3–5) x ${peso(180)}`,
        f.kids * 180,
      ])
    if (f.toddlers) lines.push([`${f.toddlers} under 2 (free)`, 0])
  }
  for (const p of parts) if (p.item) lines.push([p.item.name, p.item.price])
  const excess = pax - 6 * rooms
  if (rooms > 0 && excess > 0)
    lines.push([
      `${excess} extra guest${excess > 1 ? "s" : ""} x ${peso(250)}`,
      excess * 250,
    ])
  for (const a of f.addons)
    lines.push([`${a.name} x ${a.qty} at ${peso(a.price)}`, a.price * a.qty])
  const addonDeposit = f.addons.reduce((s, a) => s + a.deposit * a.qty, 0)
  return {
    lines,
    total: lines.reduce((s, l) => s + l[1], 0),
    pax,
    addonDeposit,
  }
}

/** Phone must have at least 7 digits. */
const phoneError = (v: string) =>
  v.replace(/\D/g, "").length === 0
    ? "Enter the guest's phone number."
    : !isValidPhone(v)
      ? "Enter a valid mobile number: 09XXXXXXXXX or +639XXXXXXXXX."
      : ""

/** Availability for every booking a form produces, de-duplicated into one result. */
function checkParts(
  state: AppState,
  f: Form,
  parts: Part[],
  date: string,
  requireOpenNow: boolean,
  pax: number,
): Check {
  const reasons: string[] = []
  if (!parts.length)
    reasons.push("Select pool entry, a cottage, a room or a pavilion.")
  parts.forEach((p, i) => {
    const r = checkAvailability(state, {
      date,
      slotId: p.slotId,
      type: p.type,
      cottageId: p.cottageId,
      pax: i === 0 ? pax : 0,
      itemPax: 0,
      requireOpenNow,
    })
    for (const x of r.reasons) if (!reasons.includes(x)) reasons.push(x)
  })
  // Several units of the same item (both Small Cabanas) need that many units free, not just one.
  for (const id of new Set(parts.map((p) => p.cottageId).filter(Boolean))) {
    const mine = parts.filter((p) => p.cottageId === id)
    const item = mine[0].item
    if (!item || mine.length < 2) continue
    const left = unitAvailability(state, item, date, mine[0].slotId, { eventStart: f.eventStart }).left
    if (left < mine.length)
      reasons.push(`Only ${Math.max(0, left)} of ${item.name} ${left === 1 ? "is" : "are"} free for this schedule; ${mine.length} selected.`)
  }
  const seats = parts
    .filter((p) => p.type === "cottage" || p.type === "event")
    .reduce((s, p) => s + (p.item?.capacity ?? 0), 0)
  const hasRoom = parts.some((p) => p.type === "room")
  if (seats > 0 && !hasRoom && pax > seats)
    reasons.push(`The selected items fit ${seats} guests; ${pax} requested.`)
  for (const a of f.addons) {
    const addon = state.addons.find((x) => x.id === a.id)
    if (addon && a.qty > addonLeft(state, addon, date))
      reasons.push(`${addon.name}: only ${addonLeft(state, addon, date)} left on this date.`)
  }
  return { ok: reasons.length === 0, reasons }
}

const optionMeta: Record<WalkOption, { title: string; blurb: string }> = {
  "acquire-now": {
    title: "Acquire now",
    blurb: "Avail the service right now. Full payment, no saved slot.",
  },
  reserve: {
    title: "Reserve",
    blurb:
      "30% downpayment holds a cottage, room or pavilion for the visit day.",
  },
  appointment: {
    title: "Book appointment",
    blurb: "Full payment now for a later slot.",
  },
}

export function WalkInPage() {
  const { state, dispatch, currentUser } = useTampisaw()
  const cash = canHandleCash(currentUser?.role)
  const { ask, dialog } = useConfirm()
  const actor = useActor()
  const [params] = useSearchParams()
  const today = todayISO()
  const preCottage = params.get("cottage") ?? ""
  const preItem = state.cottages.find((c) => c.id === preCottage)
  const [form, setForm] = useState<Form>(() => ({
    name: "",
    phone: "",
    poolEntry: !preItem,
    slotId: ["day-tour", "night-swim"].includes(params.get("slot") ?? "")
      ? (params.get("slot") as string)
      : "day-tour",
    cottageIds: preItem ? [(preItem.units ?? 1) > 1 ? unitKey(preItem, 1) : preItem.id] : [],
    addons: [],
    date: params.get("date") ?? today,
    adults: 2,
    kids: 0,
    toddlers: 0,
    eventStart: eventBlocks[0],
  }))
  const [option, setOption] = useState<WalkOption>(
    preItem ? "reserve" : "acquire-now",
  )
  const [quote, setQuote] = useState<null | {
    check: Check
    f: Form
    opt: WalkOption
    total: number
    due: number
    lines: [string, number][]
    addonDeposit: number
    holdIds: string[]
  }>(null)
  const [received, setReceived] = useState("")
  const [released, setReleased] = useState("")
  const [phoneErr, setPhoneErr] = useState("")
  const [doneIds, setDoneIds] = useState<string[]>([])
  const [codeEntered, setCodeEntered] = useState(false)
  const [codeInput, setCodeInput] = useState("")
  const holdRef = useRef<string[]>([])

  useEffect(
    () => () => {
      for (const id of holdRef.current)
        dispatch({ type: "RELEASE_HOLD", id })
    },
    [dispatch],
  )
  const { dialog: leaveDialog } = useLeaveGuard(
    doneIds.length === 0 &&
      !!(form.name || form.phone || form.addons.length || (!preItem && form.cottageIds.length) || quote),
    "Leaving now will discard the walk-in details you've entered and release any held space.",
  )

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((p) => ({ ...p, [k]: v }))
  const parts = partsOf(state, form)
  const itemsOfKind = (k: ServiceType) =>
    state.cottages.filter((c) => c.kind === k)
  const pax = form.adults + form.kids + form.toddlers
  const effectiveDate = option === "acquire-now" ? today : form.date
  const needsSession = parts.some(
    (p) => p.type === "pool" || p.type === "cottage",
  )
  const needsBlock = parts.some((p) => p.type === "event")
  const schedulable = state.slots.filter(
    (s) => s.active && ["day-tour", "night-swim"].includes(s.id),
  )
  const onlyPool = parts.length > 0 && parts.every((p) => p.type === "pool")

  const releaseHold = () => {
    for (const id of holdRef.current) dispatch({ type: "RELEASE_HOLD", id })
    holdRef.current = []
  }

  useEffect(() => {
    if (onlyPool && option === "reserve") setOption("appointment")
  }, [onlyPool, option])

  const edited = () => {
    setQuote(null)
    setPhoneErr("")
  }

  const togglePool = (on: boolean) => {
    setForm((p) => ({ ...p, poolEntry: on }))
    edited()
  }

  const toggleItem = (id: string, on: boolean) => {
    setForm((p) => ({
      ...p,
      cottageIds: on
        ? [...p.cottageIds, id]
        : p.cottageIds.filter((x) => x !== id),
    }))
    edited()
  }

  const partLabel = (ps: Part[]) =>
    ps.map((p) => (p.item ? `${p.item.name}${p.unit ? ` ${p.unit}` : ""}` : "Pool entry")).join(", ")

  const run = (f: Form, opt: WalkOption) => {
    releaseHold()
    setReleased("")
    const phoneMsg = phoneError(f.phone)
    setPhoneErr(phoneMsg)
    if (phoneMsg) return
    const date = opt === "acquire-now" ? today : f.date
    const ff = { ...f, date }
    const ps = partsOf(state, ff)
    const price = priceFor(ff, ps)
    const stamp = Date.now().toString().slice(-6)
    const check = checkParts(
      state,
      ff,
      ps,
      date,
      opt === "acquire-now",
      price.pax,
    )
    if (price.pax < 1 || ff.adults + ff.kids < 1) {
      check.ok = false
      check.reasons.unshift(
        "Enter at least one paying guest (adult or kid aged 3–5).",
      )
    }
    const due =
      opt === "reserve"
        ? requiredNow(
            ps.some((p) => p.type !== "pool") ? "cottage" : "pool",
            price.total,
            state.settings,
          )
        : price.total
    const holdIds = ps.map((_, i) => `HLD-WALK-${stamp}-${i + 1}`)
    const place = () => {
      if (check.ok) {
        ps.forEach((p, i) =>
          dispatch({
            type: "HOLD",
            payload: {
              id: holdIds[i],
              date,
              slotId: p.slotId,
              guests: i === 0 ? price.pax : 0,
              cottageId: p.cottageId,
            },
          }),
        )
        holdRef.current = holdIds
      }
      setForm(ff)
      setReceived(String(due + price.addonDeposit))
      setQuote({
        check,
        f: ff,
        opt,
        total: price.total,
        due,
        lines: price.lines,
        addonDeposit: price.addonDeposit,
        holdIds: check.ok ? holdIds : [],
      })
    }
    if (!check.ok) {
      place()
      return
    }
    const clash = ps
      .map((p) =>
        findDoubleBooking(state, {
          date,
          slotId: p.slotId,
          cottageId: p.cottageId,
          name: ff.name,
          phone: ff.phone,
        }),
      )
      .find(Boolean)
    const what = `${partLabel(ps)} for ${price.pax} guests on ${prettyDate(date)}, ${ps[0] ? slotName(state, ps[0].slotId) : ""}`
    ask({
      title: clash ? "Possible double booking" : "Hold this space?",
      body: clash
        ? `Possible double booking: ${clash} Placing a hold on ${what} may overlap it.`
        : `Place a temporary hold on ${what} while payment is collected. The hold is released if you leave or payment is not received.`,
      confirmLabel: clash ? "Book anyway" : "Place hold",
      danger: !!clash,
      run: place,
    })
  }

  const alternatives = useMemo(() => {
    if (!quote || quote.check.ok) return []
    const { f, opt } = quote
    const ps = partsOf(state, f)
    const usesSession = ps.some((p) => p.type === "pool" || p.type === "cottage")
    const slotIds = usesSession ? ["day-tour", "night-swim"] : [f.slotId]
    const dates =
      opt === "acquire-now"
        ? [today]
        : [0, 1, 2, 3, 4, 5].map((n) => addDays(f.date, n))
    const pax = f.adults + f.kids + f.toddlers
    const out: { date: string; slotId: string; label: string }[] = []
    for (const d of dates)
      for (const s of slotIds) {
        if (d === f.date && s === f.slotId) continue
        const r = checkParts(
          state,
          { ...f, slotId: s, date: d },
          partsOf(state, { ...f, slotId: s }),
          d,
          opt === "acquire-now",
          pax,
        )
        if (r.ok && out.length < 6)
          out.push({
            date: d,
            slotId: s,
            label: `${usesSession ? slotName(state, s) : "Same schedule"} · ${prettyDate(d)}`,
          })
      }
    return out
  }, [quote, state, today])

  const nextId = () => {
    const nums = state.bookings
      .map((b) => /^TMP-(\d+)$/.exec(b.id)?.[1])
      .filter((x): x is string => !!x)
      .map(Number)
    return `TMP-${Math.max(1000, ...nums) + 1}`
  }

  const paymentReceived = () => {
    if (!quote || !cash) return
    const { f, opt, total, due, addonDeposit } = quote
    const phoneMsg = phoneError(f.phone)
    if (phoneMsg) {
      setPhoneErr(phoneMsg)
      return
    }
    const ps = partsOf(state, f)
    if (!ps.length) return
    const baseNum = Number(nextId().slice(4))
    const now = new Date()
    const reserve = opt === "reserve"
    const itemTotals = ps.map((p, i) => (i === 0 ? 0 : (p.item?.price ?? 0)))
    const othersTotal = itemTotals.reduce((s, n) => s + n, 0)
    const pct = state.settings.downpaymentPct
    const dues = itemTotals.map((n) =>
      reserve ? Math.round((n * pct) / 100) : n,
    )
    const totals = itemTotals.map((n, i) => (i === 0 ? total - othersTotal : n))
    dues[0] = due - dues.slice(1).reduce((s, n) => s + n, 0)
    const bookings: Booking[] = ps.map((p, i) => ({
      id: `TMP-${baseNum + i}`,
      guestId: "walk-in",
      guestName: f.name.trim() || "Walk-in guest",
      email: "",
      phone: f.phone.trim(),
      date: f.date,
      slotId: p.slotId,
      guests: i === 0 ? f.adults + f.kids + f.toddlers : 0,
      adults: i === 0 ? f.adults : 0,
      children: i === 0 ? f.kids : 0,
      discounts: i === 0 ? f.toddlers : 0,
      type: p.type,
      cottageId: p.cottageId,
      status:
        opt === "acquire-now"
          ? "checked-in"
          : reserve
            ? "reserved"
            : "confirmed",
      risk: "low",
      paid: dues[i],
      total: totals[i],
      dueNow: dues[i],
      receipt: reserve ? "reserved" : "official",
      paymentStatus: "verified",
      paymentMethod: "cash",
      source: "walk-in",
      walkInOption: opt,
      createdAt: now.toISOString(),
      eventStart: p.type === "event" ? f.eventStart : undefined,
      addons: i === 0 ? f.addons : undefined,
      addonDeposit: i === 0 ? addonDeposit : undefined,
      checkedInAt:
        opt === "acquire-now"
          ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
          : undefined,
    }))
    const clash = ps
      .map((p) =>
        findDoubleBooking(state, {
          date: f.date,
          slotId: p.slotId,
          cottageId: p.cottageId,
          name: f.name,
          phone: f.phone,
        }),
      )
      .find(Boolean)
    const received_ = Number(received)
    const collect = due + addonDeposit
    ask({
      title: clash ? "Possible double booking" : "Confirm walk-in payment?",
      body: `${
        clash ? `Possible double booking: ${clash} ` : ""
      }Record ${bookings[0].guestName}'s ${optionMeta[opt].title.toLowerCase()} walk-in (${partLabel(ps)}, ${bookings[0].guests} guests, ${prettyDate(f.date)}, ${slotName(state, ps[0].slotId)}). Total ${peso(total)}, amount due ${peso(due)}${
        addonDeposit > 0
          ? `, plus refundable add-on deposit ${peso(addonDeposit)}`
          : ""
      }, cash received ${peso(received_)}${
        received_ > collect ? `, change ${peso(received_ - collect)}` : ""
      }. ${bookings.length > 1 ? `${bookings.length} bookings are created. ` : ""}A receipt is issued and this cannot be undone.`,
      confirmLabel: clash ? "Book anyway" : `Confirm ${peso(collect)} received`,
      danger: !!clash,
      run: () => {
        releaseHold()
        for (const b of bookings) dispatch({ type: "ADD_WALK_IN", payload: b })
        setDoneIds(bookings.map((b) => b.id))
        setCodeInput("")
        setCodeEntered(false)
      },
    })
  }

  const paymentNotReceived = () => {
    if (!quote) return
    const q = quote
    ask({
      title: "Release hold?",
      body: `The hold on ${partLabel(partsOf(state, q.f))} for ${prettyDate(q.f.date)} will be released and this ${optionMeta[q.opt].title.toLowerCase()} walk-in cancelled. This cannot be undone.`,
      confirmLabel: "Release hold",
      danger: true,
      run: () => {
        releaseHold()
        setReleased(
          `Payment not received. Hold released and the ${optionMeta[q.opt].title.toLowerCase()} walk-in is cancelled.`,
        )
        setQuote(null)
      },
    })
  }

  const reset = () => {
    releaseHold()
    setQuote(null)
    setDoneIds([])
    setReleased("")
    setPhoneErr("")
    setForm((p) => ({
      ...p,
      name: "",
      phone: "",
      cottageIds: [],
      poolEntry: true,
      addons: [],
      adults: 2,
      kids: 0,
      toddlers: 0,
    }))
  }

  const group = doneIds
    .map((id) => state.bookings.find((b) => b.id === id))
    .filter((b): b is Booking => !!b)
  const done = group[0]
  const shownSlot = parts[0]?.slotId ?? form.slotId
  const slotInfo = state.slots.find((s) => canon(s.id) === canon(shownSlot))
  const slotUsed = state.bookings
    .filter(
      (b) =>
        b.date === effectiveDate &&
        canon(b.slotId) === canon(shownSlot) &&
        isActive(b),
    )
    .reduce((s, b) => s + b.guests, 0)

  const num = (
    k: "adults" | "kids" | "toddlers",
    label: string,
    hint?: string,
  ) => (
    <Input
      label={label}
      type="number"
      min={0}
      value={form[k]}
      onChange={(e) => set(k, Math.max(0, Number(e.target.value) || 0))}
      placeholder={hint}
    />
  )

  if (done) {
    return (
      <StaffLayout>
        <PageTitle eyebrow="Walk-in entry" title="Walk-in done" />
        <WalkInResult
          booking={done}
          group={group}
          codeEntered={codeEntered}
          codeInput={codeInput}
          setCodeInput={setCodeInput}
          onEnterCode={() => setCodeEntered(true)}
          onIssue={() =>
            ask({
              title: "Issue bracelets?",
              body: `Issue ${done.guests} bracelet${
                done.guests === 1 ? "" : "s"
              } to ${done.guestName} (${done.id}) and record time in now. This cannot be undone.`,
              confirmLabel: "Issue bracelets",
              run: () =>
                dispatch({ type: "ISSUE_BRACELETS", id: done.id, by: actor }),
            })
          }
          onReset={reset}
        />
        {dialog}
      </StaffLayout>
    )
  }

  return (
    <StaffLayout>
      {leaveDialog}
      <PageTitle
        eyebrow="Walk-in entry (receptionist only)"
        title="Serve a walk-in guest"
        description="Guests without an account. Capture the details, pick an option, check space and collect payment at the counter."
      />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 text-lg font-extrabold text-ink-900">
              1. Guest and service
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Guest name"
                value={form.name}
                onChange={(e) => set("name", lettersOnly(e.target.value))}
                placeholder="Walk-in guest"
              />
              <PhoneField
                label="Phone"
                value={form.phone}
                hint={phoneErr || "Example: 09171234567 or +639171234567"}
                onChange={(v) => {
                  set("phone", v)
                  setPhoneErr("")
                }}
              />
              <fieldset className="grid gap-4 sm:col-span-2">
                <legend className="mb-2 text-sm font-semibold text-ink-800">
                  Services and items (select one or more)
                </legend>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold">
                  <input
                    type="checkbox"
                    className="size-5 accent-aqua-600"
                    checked={form.poolEntry}
                    onChange={(e) => togglePool(e.target.checked)}
                  />
                  Pool entry (admission only)
                </label>
                {(
                  [
                    ["cottage", "Cottages"],
                    ["room", "Rooms"],
                    ["event", "Pavilions"],
                  ] as [ServiceType, string][]
                ).map(([kind, title]) => (
                  <div key={kind}>
                    <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-400">
                      {title}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {itemsOfKind(kind).flatMap((c) => {
                        // An item that exists twice (the two Small Cabanas) is shown as separate options, each with live availability.
                        const many = (c.units ?? 1) > 1
                        const slotForItem = defaultSlot(c.kind, form.slotId)
                        const left = unitAvailability(state, c, effectiveDate, slotForItem, { eventStart: form.eventStart }).left
                        const options = many ? Array.from({ length: c.units! }, (_, i) => ({ key: unitKey(c, i + 1), label: `${c.name} ${i + 1}`, free: i < left })) : [{ key: c.id, label: c.name, free: left > 0 }]
                        return options.map((o) => {
                          const picked = form.cottageIds.includes(o.key)
                          const blocked = c.status === "maintenance" || (!o.free && !picked)
                          return (
                            <label
                              key={o.key}
                              className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${
                                picked ? "border-aqua-600 bg-aqua-50" : blocked ? "border-slate-200 bg-slate-50 opacity-70" : "border-slate-200"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 size-5 accent-aqua-600"
                                checked={picked}
                                disabled={blocked}
                                onChange={(e) => toggleItem(o.key, e.target.checked)}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold">{o.label}</span>
                                  <Badge tone={c.status === "maintenance" ? "neutral" : o.free ? "success" : "danger"}>
                                    {c.status === "maintenance" ? "Maintenance" : o.free ? "Available" : "Booked"}
                                  </Badge>
                                </span>
                                <span className="text-xs text-slate-500">
                                  Up to {c.capacity} · {peso(c.price)}
                                </span>
                              </span>
                            </label>
                          )
                        })
                      })}
                    </div>
                  </div>
                ))}
              </fieldset>
              {needsSession && (
                <Select
                  label="Schedule"
                  value={form.slotId}
                  onChange={(e) => {
                    set("slotId", e.target.value)
                    edited()
                  }}
                >
                  {schedulable.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({s.time})
                    </option>
                  ))}
                </Select>
              )}
              {parts.some((p) => p.type === "room") && (
                <Input
                  label="Room schedule"
                  value="Room stay: 2 PM to 11 AM next day"
                  readOnly
                />
              )}
              {needsBlock && (
                <Select
                  label="Pavilion 4-hour block"
                  value={form.eventStart}
                  onChange={(e) => set("eventStart", e.target.value)}
                >
                  {eventBlocks.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </Select>
              )}
              <Input
                label={option === "acquire-now" ? "Date (today)" : "Date"}
                type="date"
                min={today}
                value={effectiveDate}
                disabled={option === "acquire-now"}
                onChange={(e) => set("date", e.target.value)}
              />
              <div className="rounded-xl bg-sand-50 p-3 text-xs text-slate-600">
                <p className="mb-2 font-bold text-ink-900">
                  {slotInfo?.label ?? "Slot"} on {prettyDate(effectiveDate)}
                </p>
                <CapacityBar value={slotUsed} max={slotInfo?.capacity ?? 1} />
                <p className="mt-1.5">
                  {slotUsed} of {slotInfo?.capacity ?? 0} booked
                  {waitingCount(state, effectiveDate, form.slotId) > 0 && ` · ${waitingCount(state, effectiveDate, form.slotId)} on waitlist`}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {num("adults", "Adults")}
              {num("kids", "Kids aged 3–5")}
              {num("toddlers", "Under 2 (free)")}
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
              <Users size={16} /> {pax} pax in total
            </p>
            <h3 className="mb-3 mt-6 text-base font-extrabold text-ink-900">
              Add-ons (optional)
            </h3>
            <AddonSelector
              state={state}
              date={effectiveDate}
              selected={form.addons}
              onChange={(addons) => {
                set("addons", addons)
                edited()
              }}
            />
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-lg font-extrabold text-ink-900">
              2. Walk-in option
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
              {(Object.keys(optionMeta) as WalkOption[]).map((o) => {
                const disabled = o === "reserve" && onlyPool
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setOption(o)
                      setQuote(null)
                    }}
                    className={`rounded-2xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                      option === o
                        ? "border-aqua-600 bg-aqua-50"
                        : "border-slate-200 bg-white hover:border-aqua-300"
                    }`}
                  >
                    <p className="font-extrabold text-ink-900">
                      {optionMeta[o].title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {disabled
                        ? "Pool entry is paid in full. Use Acquire now or Book appointment."
                        : optionMeta[o].blurb}
                    </p>
                  </button>
                )
              })}
            </div>
            <Button
              className="mt-5 w-full sm:w-auto"
              disabled={!parts.length}
              onClick={() => run(form, option)}
            >
              {option === "acquire-now"
                ? "Check space and capacity"
                : option === "reserve"
                  ? "Check items and capacity"
                  : "Check slot availability"}
            </Button>
          </Card>
        </div>

        <div className="space-y-6">
          {!quote && !released && (
            <Card className="grid min-h-60 place-items-center p-8 text-center">
              <div>
                <Footprints className="mx-auto mb-3 text-aqua-500" size={36} />
                <p className="font-extrabold text-ink-900">
                  Quote appears here
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Availability, total price and the amount to collect.
                </p>
              </div>
            </Card>
          )}
          {released && <Note tone="danger">{released}</Note>}

          {quote && !quote.check.ok && (
            <Card className="space-y-4 p-5">
              <Note tone="danger">
                <strong>
                  {quote.opt === "acquire-now" ? "No space." : "Not available."}
                </strong>{" "}
                {quote.opt === "reserve"
                  ? "Offer other items, another date or another slot."
                  : "Offer another slot or other items."}
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {quote.check.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </Note>
              {alternatives.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-extrabold text-ink-900">
                    Offer instead
                  </p>
                  <ul className="space-y-2">
                    {alternatives.map((a) => (
                      <li key={a.label}>
                        <button
                          onClick={() =>
                            run(
                              {
                                ...quote.f,
                                date: a.date,
                                slotId: a.slotId,
                              },
                              quote.opt,
                            )
                          }
                          className="w-full rounded-xl border border-slate-200 p-3 text-left text-sm font-semibold hover:border-aqua-400 hover:bg-aqua-50"
                        >
                          {a.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No alternatives found nearby. Try other items or another date.
                </p>
              )}
              <Button variant="ghost" onClick={() => setQuote(null)}>
                Edit details
              </Button>
            </Card>
          )}

          {quote && quote.check.ok && (
            <Card className="space-y-4 p-5">
              <Note tone="success">
                <strong>Available.</strong> Space held while you collect
                payment.
              </Note>
              <div>
                <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-slate-400">
                  {optionMeta[quote.opt].title} · {prettyDate(quote.f.date)} ·{" "}
                  {partLabel(partsOf(state, quote.f))}
                </p>
                <div className="rounded-xl bg-sand-50 px-4">
                  {quote.lines.map(([l, v]) => (
                    <Row key={l} label={l}>
                      {peso(v)}
                    </Row>
                  ))}
                  <Row label="Total price">{peso(quote.total)}</Row>
                  {quote.opt === "reserve" && (
                    <Row
                      label={`${state.settings.downpaymentPct}% downpayment due`}
                    >
                      {peso(quote.due)}
                    </Row>
                  )}
                  {quote.addonDeposit > 0 && (
                    <Row label="Refundable add-on deposit (cash, not in total)">
                      {peso(quote.addonDeposit)}
                    </Row>
                  )}
                </div>
              </div>
              {!cash ? (
                <CashNote />
              ) : (
                <>
                  <div className="rounded-xl border border-aqua-200 bg-aqua-50/50 p-4">
                    <p className="text-sm font-extrabold text-ink-900">
                      Collect{" "}
                      {quote.opt === "reserve"
                        ? `the ${state.settings.downpaymentPct}% downpayment`
                        : "full payment"}{" "}
                      at the counter:{" "}
                      <span className="text-aqua-800">
                        {peso(quote.due + quote.addonDeposit)}
                      </span>
                      {quote.addonDeposit > 0 && (
                        <span className="block text-xs font-normal text-slate-500">
                          Includes {peso(quote.addonDeposit)} refundable add-on
                          deposit.
                        </span>
                      )}
                    </p>
                    {quote.opt === "acquire-now" && (
                      <p className="mt-1 text-xs text-slate-500">
                        No downpayment; the slot is not saved for later.
                      </p>
                    )}
                    <div className="mt-3">
                      <Input
                        label="Cash received"
                        type="number"
                        min={0}
                        value={received}
                        onChange={(e) => setReceived(e.target.value)}
                      />
                      {Number(received) > quote.due + quote.addonDeposit && (
                        <p className="mt-2 text-xs font-semibold text-success-700">
                          Change:{" "}
                          {peso(
                            Number(received) - quote.due - quote.addonDeposit,
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      disabled={
                        Number(received) < quote.due + quote.addonDeposit
                      }
                      onClick={paymentReceived}
                    >
                      <CheckCircle2 size={18} /> Payment received
                    </Button>
                    <Button variant="danger" onClick={paymentNotReceived}>
                      Not received: release hold
                    </Button>
                  </div>
                </>
              )}
              {!cash && (
                <Button variant="danger" onClick={paymentNotReceived}>
                  Release hold
                </Button>
              )}
            </Card>
          )}
        </div>
      </div>
      {dialog}
    </StaffLayout>
  )
}

function WalkInResult({
  booking: b,
  group,
  codeEntered,
  codeInput,
  setCodeInput,
  onEnterCode,
  onIssue,
  onReset,
}: {
  booking: Booking
  group: Booking[]
  codeEntered: boolean
  codeInput: string
  setCodeInput: (v: string) => void
  onEnterCode: () => void
  onIssue: () => void
  onReset: () => void
}) {
  const { state } = useTampisaw()
  const acquire = b.walkInOption === "acquire-now"
  const issued = (b.bracelets ?? []).filter((x) => !x.voided)
  const reserved = b.receipt === "reserved"
  const finished = !acquire || issued.length > 0

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card className="p-6 print:shadow-none">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-aqua-700">
              Golden Pyramid Swimming Pool
            </p>
            <h2 className="mt-1 text-2xl font-extrabold text-ink-900">
              {reserved ? "RESERVED" : "OFFICIAL RECEIPT"}
            </h2>
            <p className="text-xs text-slate-500">
              {reserved
                ? "Downpayment received. This is not an official receipt."
                : "Paid in full."}
            </p>
          </div>
          <StatusBadge status={b.status} />
        </div>
        <div className="rounded-xl bg-sand-50 px-4">
          <Row label="Code">{b.id}</Row>
          <Row label="Guest">{b.guestName}</Row>
          <Row label="Service">
            {group
              .map((x) =>
                x.cottageId ? itemName(state, x.cottageId) : "Pool entry",
              )
              .join(", ")}
          </Row>
          {group.length > 1 && (
            <Row label="Booking codes">{group.map((x) => x.id).join(", ")}</Row>
          )}
          {!!b.addons?.length && (
            <Row label="Add-ons">
              {b.addons.map((a) => `${a.name} x ${a.qty}`).join(", ")}
            </Row>
          )}
          {(b.addonDeposit ?? 0) > 0 && (
            <Row label="Refundable add-on deposit (cash)">
              {peso(b.addonDeposit ?? 0)}
            </Row>
          )}
          <Row label="Date & slot">
            {prettyDate(b.date)} · {slotName(state, b.slotId)}
          </Row>
          {b.eventStart && <Row label="Block">{b.eventStart}</Row>}
          <Row label="Guests">
            {b.adults ?? 0} adult · {b.children ?? 0} kids · {b.discounts ?? 0}{" "}
            under 2
          </Row>
          <Row label="Total">
            {peso(group.reduce((s, x) => s + x.total, 0))}
          </Row>
          <Row label="Paid (cash)">
            {peso(group.reduce((s, x) => s + x.paid, 0))}
          </Row>
          <Row label="Balance due on visit day">
            {peso(group.reduce((s, x) => s + balanceOf(x), 0))}
          </Row>
        </div>
        {!acquire && (
          <div className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-4">
            <QRCodeSVG value={b.id} size={150} marginSize={1} />
            <p className="text-sm font-extrabold tracking-wider">{b.id}</p>
            <p className="text-center text-xs text-slate-500">
              Give or send this code to the guest. On the visit day: QR
              verification, {reserved ? "balance collected, " : ""}bracelet and
              time in.
            </p>
          </div>
        )}
        <Button
          variant="secondary"
          className="mt-4 w-full print:hidden"
          onClick={() => window.print()}
        >
          <Printer size={18} /> Print receipt
        </Button>
      </Card>

      <div className="space-y-4">
        {acquire ? (
          <Card className="space-y-4 p-6">
            <h2 className="text-lg font-extrabold text-ink-900">Entry steps</h2>
            <Note tone="success">
              Payment received. Official receipt issued; status Confirmed and
              checked in.
            </Note>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-extrabold text-ink-900">
                1. Enter the visit code in the database
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Generated code <strong>{b.id}</strong>. Saved to Forecast
                (walk-ins carry no no-show risk).
              </p>
              {codeEntered ? (
                <p className="mt-2 text-sm font-semibold text-success-700">
                  Visit code recorded.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Input
                      label="Type the visit code"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      placeholder={b.id}
                    />
                  </div>
                  <Button
                    disabled={norm(codeInput) !== norm(b.id)}
                    onClick={onEnterCode}
                  >
                    Record code
                  </Button>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-extrabold text-ink-900">
                2. Issue bracelets and enter time in
              </p>
              {issued.length === 0 ? (
                <Button
                  className="mt-3"
                  disabled={!codeEntered}
                  onClick={onIssue}
                >
                  <Watch size={18} /> Issue {b.guests} bracelet
                  {b.guests === 1 ? "" : "s"}
                </Button>
              ) : (
                <>
                  <p className="mt-1 text-xs text-slate-500">
                    Time in {timeInOf(b)}.
                  </p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {issued.map((x) => (
                      <li
                        key={x.serial}
                        className="rounded-lg bg-sand-50 px-3 py-2 text-xs"
                      >
                        <span className="block font-extrabold">{x.serial}</span>
                        <span className="text-slate-500">{x.color}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {finished && (
              <Note tone="success">
                Walk-in done.{" "}
                {b.type === "pool"
                  ? "Pool slot count updated."
                  : `${itemName(state, b.cottageId)} is now in use.`}
              </Note>
            )}
          </Card>
        ) : (
          <Card className="space-y-4 p-6">
            <Note tone="success">
              {reserved
                ? `Reservation saved. ${itemName(state, b.cottageId)} is blocked for others. Status Reserved; RESERVED receipt issued.`
                : "Appointment saved. Status Confirmed; official receipt issued."}
            </Note>
            <p className="text-sm text-slate-600">
              No no-show risk score applies to walk-in guests.
            </p>
          </Card>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onReset} disabled={acquire && !finished}>
            <Footprints size={18} /> New walk-in
          </Button>
          <Link to="/staff/bracelets">
            <Button variant="secondary">
              <Watch size={18} /> Bracelets
            </Button>
          </Link>
          <Link to="/staff">
            <Button variant="ghost">Back to dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
