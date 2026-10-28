import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LifeBuoy,
  Plus,
  Trash2,
} from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { ConfirmDialog, useConfirm } from "../components/confirm"
import { useLeaveGuard } from "../components/leave-guard"
import { AdminLayout, StaffLayout } from "../components/layouts"
import {
  Badge,
  Button,
  CapacityBar,
  Card,
  Input,
  Modal,
  PageTitle,
  Select,
} from "../components/ui"
import {
  addonDepositTotal,
  addonLeft,
  addonTaken,
  canHandleCash,
  guardsNeeded,
  poolLogStatus,
  poolRange,
  isAdminRole,
} from "../lib/ops"
import { peso, prettyDate, prettyDateTime, todayISO } from "../lib/rules"
import { forecastData } from "../data"
import { useTampisaw } from "../store"
import type { AppState, Addon, LifeguardShiftName } from "../types"

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

function Callout({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "info"
  children: ReactNode
}) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-success-200 bg-success-50 text-success-900",
    warning: "border-warning-200 bg-warning-50 text-warning-900",
    danger: "border-danger-200 bg-danger-50 text-danger-900",
  }
  return (
    <div
      className={`flex gap-3 rounded-xl border p-3.5 text-sm leading-6 ${tones[tone]}`}
    >
      <span className="mt-0.5 shrink-0">
        {tone === "success" ? (
          <CheckCircle2 size={18} />
        ) : (
          <AlertTriangle size={18} />
        )}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

const useActor = () => useTampisaw().currentUser?.name ?? "Staff"

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const ATTENDED = ["checked-in", "checked-out", "completed"]
const BOOKED = [
  "pending",
  "reserved",
  "confirmed",
  "checked-in",
  "checked-out",
  "completed",
]
const isNight = (slotId: string) => slotId === "night-swim"

/* ------------------------------------------------------------------ */
/* Forecast (SMA)                                                      */
/* ------------------------------------------------------------------ */

type Forecast = {
  day: number
  night: number
  method: string
  booked: { day: number; night: number }
}

function forecastFor(state: AppState, date: string): Forecast {
  const actual = (d: string, night: boolean) =>
    state.bookings
      .filter(
        (b) =>
          b.date === d &&
          ATTENDED.includes(b.status) &&
          isNight(b.slotId) === night,
      )
      .reduce((s, b) => s + b.guests, 0)
  const sma = (night: boolean) => {
    const vals: number[] = []
    for (let i = 1; i <= 14 && vals.length < 7; i++) {
      const v = actual(addDays(date, -i), night)
      if (v > 0) vals.push(v)
    }
    return vals.length >= 3
      ? {
          avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
          n: vals.length,
        }
      : null
  }
  const dayS = sma(false)
  const nightS = sma(true)
  const withActual = forecastData.filter((f) => f.actual !== null) as {
    actual: number
  }[]
  const fallbackDay = Math.round(
    withActual.reduce((s, f) => s + f.actual, 0) /
      Math.max(1, withActual.length),
  )
  const booked = (night: boolean) =>
    state.bookings
      .filter(
        (b) =>
          b.date === date &&
          BOOKED.includes(b.status) &&
          isNight(b.slotId) === night,
      )
      .reduce((s, b) => s + b.guests, 0)
  const bookedDay = booked(false)
  const bookedNight = booked(true)
  const dayBase = dayS?.avg ?? fallbackDay
  const nightBase = nightS?.avg ?? Math.round(fallbackDay * 0.35)
  return {
    day: Math.max(dayBase, bookedDay),
    night: Math.max(nightBase, bookedNight),
    booked: { day: bookedDay, night: bookedNight },
    method: dayS
      ? `${dayS.n}-day simple moving average of checked-in guests`
      : `built-in weekly forecast (average ${fallbackDay} guests); fewer than 3 days of recorded attendance`,
  }
}

const shifts: { id: LifeguardShiftName; label: string; hours: string }[] = [
  { id: "morning", label: "Morning", hours: "6:00 AM – 12:00 PM" },
  { id: "afternoon", label: "Afternoon", hours: "12:00 – 6:00 PM" },
  { id: "night", label: "Night", hours: "6:00 PM – 12:00 AM" },
]

/* ------------------------------------------------------------------ */
/* Rapid incident entry                                                */
/* ------------------------------------------------------------------ */

function RapidIncident() {
  const { dispatch } = useTampisaw()
  const actor = useActor()
  const { ask, dialog } = useConfirm()
  const [type, setType] = useState("Injury")
  const [guest, setGuest] = useState("")
  const [location, setLocation] = useState("")
  const [description, setDescription] = useState("")
  const [serious, setSerious] = useState(false)
  const [done, setDone] = useState("")
  const valid = location.trim() && description.trim()
  return (
    <Card className="p-5">
      <h2 className="text-lg font-extrabold text-ink-900">
        Rapid incident entry
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Log an injury, rescue or first-aid case in seconds. It appears in
        Incidents for follow-up.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="What happened"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option>Injury</option>
          <option>Rescue</option>
          <option>First aid administered</option>
        </Select>
        <Input
          label="Guest involved (optional)"
          value={guest}
          onChange={(e) => setGuest(e.target.value)}
          placeholder="Name or description"
        />
        <Input
          label="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Main pool, deep end"
        />
        <Input
          label="Short description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What was done"
        />
      </div>
      <label className="mt-3 flex items-center gap-3 text-sm font-semibold text-ink-800">
        <input
          type="checkbox"
          className="size-4"
          checked={serious}
          onChange={(e) => setSerious(e.target.checked)}
        />
        Serious: needs escalation to the manager
      </label>
      {done && (
        <div className="mt-3">
          <Callout tone="success">{done}</Callout>
        </div>
      )}
      <Button
        className="mt-4 w-full sm:w-auto"
        disabled={!valid}
        variant={serious ? "danger" : "primary"}
        onClick={() =>
          ask({
            title: "Log this incident?",
            body: `${type} at ${location.trim()} involving ${guest.trim() || "an unidentified guest"}: ${description.trim()}. ${
              serious
                ? "It is marked serious and escalated to the manager. "
                : ""
            }It appears in Incidents and cannot be undone.`,
            confirmLabel: "Log incident",
            danger: serious,
            run: () => {
              dispatch({
                type: "ADD_INCIDENT",
                payload: {
                  guestName: guest.trim() || "Unidentified guest",
                  type,
                  location: location.trim(),
                  description: `${description.trim()} (logged by ${actor})`,
                  serious,
                  escalated: serious,
                  source: "staff",
                },
              })
              setDone(`${type} logged${serious ? " and escalated" : ""}.`)
              setGuest("")
              setLocation("")
              setDescription("")
              setSerious(false)
            },
          })
        }
      >
        Log incident
      </Button>
      {dialog}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Lifeguards                                                          */
/* ------------------------------------------------------------------ */

export function LifeguardsPage() {
  const { state, dispatch, currentUser } = useTampisaw()
  const actor = useActor()
  const { ask, dialog } = useConfirm()
  const [date, setDate] = useState(todayISO())
  const [warn, setWarn] = useState("")
  const [cfg, setCfg] = useState(state.opsConfig)
  const [saved, setSaved] = useState(false)
  const isAdmin = isAdminRole(currentUser?.role)
  const fc = useMemo(() => forecastFor(state, date), [state, date])
  const { guestsPerLifeguard, minLifeguardsPerShift } = state.opsConfig
  const guards = state.lifeguards.filter((g) => g.active)
  const dayRoster = state.roster.filter((r) => r.date === date)
  const nameOf = (id: string) =>
    state.lifeguards.find((g) => g.id === id)?.name ?? id

  return (
    <StaffLayout>
      <PageTitle
        eyebrow="Lifeguard operations"
        title="Duty roster"
        description="Assign lifeguards to shifts and compare each shift against the expected crowd."
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          aria-label="Previous day"
          onClick={() => setDate(addDays(date, -1))}
        >
          <ChevronLeft size={18} />
        </Button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold"
          aria-label="Roster date"
        />
        <Button
          variant="secondary"
          aria-label="Next day"
          onClick={() => setDate(addDays(date, 1))}
        >
          <ChevronRight size={18} />
        </Button>
        <Button variant="ghost" onClick={() => setDate(todayISO())}>
          Today
        </Button>
        <span className="text-sm font-semibold text-slate-500">
          {prettyDate(date)}
        </span>
      </div>
      {warn && (
        <div className="mb-4">
          <Callout tone="warning">{warn}</Callout>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {shifts.map((s) => {
          const expected = s.id === "night" ? fc.night : fc.day
          const bookedHere = s.id === "night" ? fc.booked.night : fc.booked.day
          const needed = guardsNeeded(
            expected,
            guestsPerLifeguard,
            minLifeguardsPerShift,
          )
          const entries = dayRoster.filter((r) => r.shift === s.id)
          const diff = entries.length - needed
          const tone = diff === 0 ? "success" : diff < 0 ? "danger" : "warning"
          const chip =
            diff === 0
              ? "Covered"
              : diff < 0
                ? `Short by ${-diff}`
                : `Over-staffed by ${diff}`
          const available = guards.filter(
            (g) => !entries.some((e) => e.guardId === g.id),
          )
          return (
            <Card key={s.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-extrabold text-ink-900">
                    {s.label} shift
                  </h2>
                  <p className="text-xs text-slate-500">{s.hours}</p>
                </div>
                <Badge tone={tone}>{chip}</Badge>
              </div>
              <p className="mt-4 text-3xl font-extrabold text-ink-900">
                {entries.length}
                <span className="text-base font-semibold text-slate-400">
                  {" "}
                  / {needed} guards
                </span>
              </p>
              <div className="mt-2">
                <CapacityBar value={entries.length} max={Math.max(1, needed)} />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Expected crowd <strong>{expected}</strong> guests ({bookedHere}{" "}
                confirmed booked). At one guard per {guestsPerLifeguard} guests
                with a minimum of {minLifeguardsPerShift}, this shift needs{" "}
                <strong>{needed}</strong>.{" "}
                {diff === 0
                  ? "The roster matches the forecast."
                  : diff < 0
                    ? `Add ${-diff} more lifeguard${
                        -diff === 1 ? "" : "s"
                      } to keep the ratio safe.`
                    : `${diff} guard${
                        diff === 1 ? " is" : "s are"
                      } above the ratio; consider moving one to a short shift.`}
              </p>
              <ul className="my-4 flex-1 space-y-2">
                {entries.length === 0 && (
                  <li className="text-sm text-slate-400">
                    Nobody assigned yet.
                  </li>
                )}
                {entries.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-sand-50 px-3 py-2 text-sm font-bold text-ink-900"
                  >
                    <span className="flex items-center gap-2">
                      <LifeBuoy size={16} className="text-aqua-700" />{" "}
                      {nameOf(r.guardId)}
                    </span>
                    <button
                      className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-danger-50 hover:text-danger-600"
                      aria-label={`Remove ${nameOf(r.guardId)}`}
                      onClick={() =>
                        ask({
                          title: `Remove ${nameOf(r.guardId)} from the ${s.label} shift?`,
                          body: `${nameOf(r.guardId)} will be unassigned from the ${s.label} shift (${s.hours}) on ${prettyDate(date)}. The shift will have ${Math.max(0, entries.length - 1)} of ${needed} guards.`,
                          confirmLabel: "Remove from shift",
                          danger: true,
                          run: () => {
                            setWarn("")
                            dispatch({
                              type: "UNASSIGN_SHIFT",
                              id: r.id,
                              by: actor,
                            })
                          },
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              <Select
                label="Assign lifeguard"
                value=""
                onChange={(e) => {
                  const guardId = e.target.value
                  if (!guardId) return
                  const clash = dayRoster.find(
                    (r) => r.guardId === guardId && r.shift !== s.id,
                  )
                  setWarn("")
                  ask({
                    title: clash
                      ? "Double assignment"
                      : `Assign ${nameOf(guardId)} to the ${s.label} shift?`,
                    body: clash
                      ? `${nameOf(guardId)} is already on the ${clash.shift} shift on ${prettyDate(date)}. Assigning them to the ${s.label} shift (${s.hours}) as well creates a double assignment.`
                      : `${nameOf(guardId)} will be added to the ${s.label} shift (${s.hours}) on ${prettyDate(date)}. The shift will have ${entries.length + 1} of ${needed} guards.`,
                    confirmLabel: clash ? "Assign anyway" : "Assign lifeguard",
                    danger: !!clash,
                    run: () =>
                      dispatch({
                        type: "ASSIGN_SHIFT",
                        date,
                        shift: s.id,
                        guardId,
                        by: actor,
                      }),
                  })
                }}
              >
                <option value="">Choose a lifeguard</option>
                {available.map((g) => {
                  const other = dayRoster.find((r) => r.guardId === g.id)
                  return (
                    <option key={g.id} value={g.id}>
                      {g.name}
                      {other ? ` (on ${other.shift})` : ""}
                    </option>
                  )
                })}
              </Select>
            </Card>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Forecast basis: {fc.method}; raised to the confirmed headcount when
        bookings exceed it. Day crowds stay for both morning and afternoon
        shifts.
      </p>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <RapidIncident />
        <Card className="p-5">
          <h2 className="text-lg font-extrabold text-ink-900">
            Staffing ratio
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Used to compute how many guards each shift needs.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Guests per lifeguard"
              type="number"
              min={1}
              disabled={!isAdmin}
              value={cfg.guestsPerLifeguard}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  guestsPerLifeguard: Math.max(1, Number(e.target.value)),
                })
              }
            />
            <Input
              label="Minimum guards per shift"
              type="number"
              min={1}
              disabled={!isAdmin}
              value={cfg.minLifeguardsPerShift}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  minLifeguardsPerShift: Math.max(1, Number(e.target.value)),
                })
              }
            />
          </div>
          {isAdmin ? (
            <Button
              className="mt-4"
              onClick={() =>
                ask({
                  title: "Save staffing ratio?",
                  body: `Guests per lifeguard changes from ${state.opsConfig.guestsPerLifeguard} to ${cfg.guestsPerLifeguard}, minimum guards per shift from ${state.opsConfig.minLifeguardsPerShift} to ${cfg.minLifeguardsPerShift}. Every shift's required headcount is recalculated.`,
                  confirmLabel: "Save ratio",
                  run: () => {
                    dispatch({
                      type: "SAVE_OPS_CONFIG",
                      config: cfg,
                      by: actor,
                    })
                    setSaved(true)
                  },
                })
              }
            >
              Save ratio
            </Button>
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              Only administrators can change the ratio.
            </p>
          )}
          {saved && (
            <p className="mt-2 text-sm font-semibold text-success-700">
              Saved.
            </p>
          )}
        </Card>
      </div>
      {dialog}
    </StaffLayout>
  )
}

/* ------------------------------------------------------------------ */
/* Pool log                                                            */
/* ------------------------------------------------------------------ */

export function PoolLogPage() {
  const { state, dispatch } = useTampisaw()
  const actor = useActor()
  const { ask, dialog } = useConfirm()
  const [ph, setPh] = useState("7.4")
  const [chlorine, setChlorine] = useState("2.0")
  const [backwash, setBackwash] = useState(false)
  const [cleaned, setCleaned] = useState(false)
  const [notes, setNotes] = useState("")
  const [lockDate, setLockDate] = useState(todayISO())
  const [lockSlot, setLockSlot] = useState("")
  const [lockReason, setLockReason] = useState("")
  const [removeId, setRemoveId] = useState<string | null>(null)

  const phN = Number(ph)
  const clN = Number(chlorine)
  const validNums =
    ph !== "" && chlorine !== "" && !Number.isNaN(phN) && !Number.isNaN(clN)
  const preview = validNums ? poolLogStatus(phN, clN) : null
  const slotName = (id?: string) =>
    id ? (state.slots.find((s) => s.id === id)?.label ?? id) : "All slots"
  const lockouts = [...state.blackouts].sort((a, b) =>
    a.date < b.date ? -1 : 1,
  )
  const toRemove = state.blackouts.find((b) => b.id === removeId)

  return (
    <AdminLayout>
      <PageTitle
        eyebrow="Facility operations"
        title="Aquatic maintenance ledger"
        description="Record water chemistry and cleaning cycles, and close the pool to bookings when maintenance requires it."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 text-lg font-extrabold text-ink-900">
            Log water reading
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Safe range: pH {poolRange.ph[0]}–{poolRange.ph[1]}, free chlorine{" "}
            {poolRange.chlorine[0]}–{poolRange.chlorine[1]} ppm.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="pH"
              type="number"
              step="0.1"
              value={ph}
              onChange={(e) => setPh(e.target.value)}
            />
            <Input
              label="Free chlorine (ppm)"
              type="number"
              step="0.1"
              value={chlorine}
              onChange={(e) => setChlorine(e.target.value)}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-5 text-sm font-semibold text-ink-800">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={backwash}
                onChange={(e) => setBackwash(e.target.checked)}
              />{" "}
              Filtration backwash done
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={cleaned}
                onChange={(e) => setCleaned(e.target.checked)}
              />{" "}
              Pool cleaning cycle done
            </label>
          </div>
          <div className="mt-3">
            <Input
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dosing, repairs, observations"
            />
          </div>
          {preview === "out-of-range" && (
            <div className="mt-3">
              <Callout tone="danger">
                <strong>Out of safe range.</strong> Treat the water and consider
                a maintenance lockout before the next session.
              </Callout>
            </div>
          )}
          {preview === "ok" && (
            <div className="mt-3">
              <Callout tone="success">Within safe range.</Callout>
            </div>
          )}
          <Button
            className="mt-4"
            disabled={!validNums}
            onClick={() =>
              ask({
                title: "Save this water reading?",
                body: `pH ${phN}, free chlorine ${clN} ppm (${
                  preview === "ok" ? "within" : "outside"
                } the safe range). Backwash ${
                  backwash ? "done" : "not done"
                }, cleaning ${
                  cleaned ? "done" : "not done"
                }. Logged by ${actor} and cannot be undone.`,
                confirmLabel: "Save reading",
                danger: preview === "out-of-range",
                run: () => {
                  dispatch({
                    type: "POOL_LOG",
                    payload: {
                      ph: phN,
                      chlorine: clN,
                      backwash,
                      cleaned,
                      notes: notes.trim(),
                      by: actor,
                    },
                  })
                  setNotes("")
                  setBackwash(false)
                  setCleaned(false)
                },
              })
            }
          >
            <Plus size={18} /> Save reading
          </Button>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-lg font-extrabold text-ink-900">
            Add maintenance lockout
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Guests cannot book a closed date or slot. Existing bookings are not
            cancelled automatically.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Date"
              type="date"
              value={lockDate}
              onChange={(e) => setLockDate(e.target.value)}
            />
            <Select
              label="Slot"
              value={lockSlot}
              onChange={(e) => setLockSlot(e.target.value)}
            >
              <option value="">All slots</option>
              {state.slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-3">
            <Input
              label="Reason"
              value={lockReason}
              onChange={(e) => setLockReason(e.target.value)}
              placeholder="e.g. Pump replacement"
            />
          </div>
          <Button
            className="mt-4"
            disabled={!lockDate || !lockReason.trim()}
            onClick={() => {
              const affected = state.bookings.filter(
                (b) =>
                  b.date === lockDate &&
                  (!lockSlot || b.slotId === lockSlot) &&
                  ["pending", "reserved", "confirmed", "checked-in"].includes(
                    b.status,
                  ),
              ).length
              ask({
                title: "Close for maintenance?",
                body: (
                  <>
                    Guests will not be able to book {prettyDate(lockDate)} (
                    {slotName(lockSlot || undefined)}). Reason:{" "}
                    {lockReason.trim()}.
                    {affected > 0 && (
                      <strong className="mt-2 block text-danger-700">
                        {affected} existing booking{affected === 1 ? "" : "s"}{" "}
                        will be affected. They are not cancelled automatically
                        and need follow-up.
                      </strong>
                    )}
                  </>
                ),
                confirmLabel:
                  affected > 0 ? "Close anyway" : "Close for maintenance",
                danger: affected > 0,
                run: () => {
                  dispatch({
                    type: "ADD_BLACKOUT",
                    date: lockDate,
                    slotId: lockSlot || undefined,
                    reason: lockReason.trim(),
                    kind: "maintenance",
                  })
                  setLockReason("")
                },
              })
            }}
          >
            Close for maintenance
          </Button>
          <h3 className="mb-2 mt-6 text-sm font-extrabold text-ink-900">
            Current lockouts
          </h3>
          {lockouts.length === 0 ? (
            <p className="text-sm text-slate-500">No closures or lockouts.</p>
          ) : (
            <ul className="space-y-2">
              {lockouts.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-sand-50 px-3 py-2.5 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block font-bold text-ink-900">
                      {prettyDate(b.date)} · {slotName(b.slotId)}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {b.reason}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge
                      tone={
                        b.kind === "maintenance"
                          ? "warning"
                          : b.kind === "weather"
                            ? "info"
                            : "neutral"
                      }
                    >
                      {b.kind ?? "closure"}
                    </Badge>
                    <button
                      className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-danger-50 hover:text-danger-600"
                      aria-label="Remove lockout"
                      onClick={() => setRemoveId(b.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-extrabold text-ink-900">
            Reading history
          </h2>
        </div>
        {state.poolLogs.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">No readings logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-sand-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">pH</th>
                  <th className="p-3">Chlorine</th>
                  <th className="p-3">Backwash</th>
                  <th className="p-3">Cleaning</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.poolLogs.map((l) => {
                  const ok = poolLogStatus(l.ph, l.chlorine) === "ok"
                  return (
                    <tr key={l.id}>
                      <td className="p-3 font-semibold">
                        {prettyDateTime(l.at)}
                        <span className="block text-xs font-normal text-slate-500">
                          {l.by}
                        </span>
                      </td>
                      <td className="p-3">{l.ph}</td>
                      <td className="p-3">{l.chlorine} ppm</td>
                      <td className="p-3">{l.backwash ? "Yes" : "No"}</td>
                      <td className="p-3">{l.cleaned ? "Yes" : "No"}</td>
                      <td className="p-3">
                        <Badge tone={ok ? "success" : "danger"}>
                          {ok ? "In range" : "Out of range"}
                        </Badge>
                      </td>
                      <td className="p-3 text-slate-600">{l.notes || "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6">
        <RapidIncident />
      </div>

      <ConfirmDialog
        danger
        closeOnConfirm
        open={!!toRemove}
        title="Remove this lockout?"
        message={
          toRemove && (
            <>
              Guests will be able to book {prettyDate(toRemove.date)} (
              {slotName(toRemove.slotId)}) again. Reason on file:{" "}
              {toRemove.reason}.
            </>
          )
        }
        confirmLabel="Remove lockout"
        onCancel={() => setRemoveId(null)}
        onConfirm={() =>
          removeId &&
          dispatch({ type: "REMOVE_BLACKOUT", id: removeId, by: actor })
        }
      />
      {dialog}
    </AdminLayout>
  )
}

/* ------------------------------------------------------------------ */
/* Add-ons                                                             */
/* ------------------------------------------------------------------ */

const blankAddon = (): Addon => ({
  id: "",
  name: "",
  description: "",
  price: 0,
  unit: "per day",
  dailyCap: 1,
  deposit: 0,
  image: "",
  active: true,
})

export function AddonsOpsPage() {
  const { state, dispatch, currentUser } = useTampisaw()
  const actor = useActor()
  const { ask, dialog } = useConfirm()
  const cash = canHandleCash(currentUser?.role)
  const [date, setDate] = useState(todayISO())
  const [editing, setEditing] = useState<Addon | null>(null)
  const [isNew, setIsNew] = useState(false)
  const { dialog: leaveDialog } = useLeaveGuard(!!editing, "Leaving now will discard your unsaved changes.")
  const [feeGuest, setFeeGuest] = useState("")
  const [feeBooking, setFeeBooking] = useState("")
  const [feeItem, setFeeItem] = useState("")
  const [feeAmount, setFeeAmount] = useState("")
  const [feeNote, setFeeNote] = useState("")
  const canEdit =
    isAdminRole(currentUser?.role)

  const holders = state.bookings.filter(
    (b) =>
      b.date === date &&
      b.addons?.length &&
      ["pending", "reserved", "confirmed", "checked-in"].includes(b.status),
  )
  const guestBookings = state.bookings.filter((b) => b.guestId === feeGuest)
  const guestsWithFees = state.guests.filter((g) =>
    (g.damageFees ?? []).some((f) => !f.settled),
  )
  const depositRows = state.bookings
    .filter(
      (b) =>
        b.date === date &&
        [
          "confirmed",
          "checked-in",
          "checked-out",
          "completed",
          "reserved",
        ].includes(b.status),
    )
    .map((b) => {
      const held = b.addonDeposit ?? addonDepositTotal(b.addons)
      const fees = (
        state.guests.find((g) => g.id === b.guestId)?.damageFees ?? []
      )
        .filter((f) => !f.settled)
        .reduce((s, f) => s + f.amount, 0)
      return { b, held, fees }
    })
    .filter((r) => r.held > 0 || r.fees > 0)

  const saveAddon = () => {
    if (!editing) return
    const id = isNew
      ? `ad-${editing.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}`
      : editing.id
    ask({
      title: isNew
        ? `Create add-on ${editing.name}?`
        : `Save changes to ${editing.name}?`,
      body: `${editing.name}: ${peso(editing.price)} ${editing.unit}, deposit ${peso(editing.deposit)}, daily cap ${editing.dailyCap}, ${
        editing.active ? "available" : "hidden"
      } to guests. New bookings use these values immediately.`,
      confirmLabel: isNew ? "Create add-on" : "Save add-on",
      run: () => {
        dispatch({ type: "SAVE_ADDON", addon: { ...editing, id }, by: actor })
        setEditing(null)
      },
    })
  }
  const numField = (key: "price" | "dailyCap" | "deposit", label: string) => (
    <Input
      label={label}
      type="number"
      min={0}
      value={editing?.[key] ?? 0}
      onChange={(e) =>
        editing &&
        setEditing({ ...editing, [key]: Math.max(0, Number(e.target.value)) })
      }
    />
  )

  return (
    <StaffLayout>
      {leaveDialog}
      <PageTitle
        eyebrow="Facility operations"
        title="Add-ons & deposits"
        description="Equipment availability, who holds what, and damage or loss fees against refundable deposits."
        action={
          canEdit && (
            <Button
              onClick={() => {
                setIsNew(true)
                setEditing(blankAddon())
              }}
            >
              <Plus size={18} /> New add-on
            </Button>
          )
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Input
          label="Inventory date"
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
        <span className="mt-6 text-sm font-semibold text-slate-500">
          {prettyDate(date)}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {state.addons.map((a) => {
          const used = addonTaken(state, a.id, date)
          return (
            <Card key={a.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-extrabold text-ink-900">{a.name}</h2>
                {!a.active && <Badge tone="neutral">Inactive</Badge>}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {peso(a.price)} {a.unit} · deposit {peso(a.deposit)}
              </p>
              <p className="mt-3 text-2xl font-extrabold text-ink-900">
                {used}
                <span className="text-sm font-semibold text-slate-400">
                  {" "}
                  / {a.dailyCap} used
                </span>
              </p>
              <div className="mt-2">
                <CapacityBar value={used} max={Math.max(1, a.dailyCap)} />
              </div>
              <p className="mt-2 flex-1 text-xs text-slate-500">
                {addonLeft(state, a, date)} left for this date
              </p>
              {canEdit && (
                <Button
                  variant="secondary"
                  className="mt-3"
                  onClick={() => {
                    setIsNew(false)
                    setEditing({ ...a })
                  }}
                >
                  Edit
                </Button>
              )}
            </Card>
          )
        })}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-extrabold text-ink-900">
            Who holds what on {prettyDate(date)}
          </h2>
          {holders.length === 0 ? (
            <p className="text-sm text-slate-500">
              No add-ons reserved for this date.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {holders.map((b) => (
                <li key={b.id} className="py-3 text-sm">
                  <p className="font-bold text-ink-900">
                    {b.guestName}{" "}
                    <span className="font-normal text-slate-500">· {b.id}</span>
                  </p>
                  <p className="text-slate-600">
                    {b.addons?.map((a) => `${a.qty} × ${a.name}`).join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {cash ? (
          <Card className="p-5">
            <h2 className="mb-1 text-lg font-extrabold text-ink-900">
              Log damage or loss fee
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              Unsettled fees are deducted from the guest's deposit before
              refund.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Guest"
                value={feeGuest}
                onChange={(e) => {
                  setFeeGuest(e.target.value)
                  setFeeBooking("")
                }}
              >
                <option value="">Choose a guest</option>
                {state.guests.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Booking (optional)"
                value={feeBooking}
                onChange={(e) => setFeeBooking(e.target.value)}
                disabled={!feeGuest}
              >
                <option value="">Not linked</option>
                {guestBookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} · {prettyDate(b.date)}
                  </option>
                ))}
              </Select>
              <Input
                label="Item"
                value={feeItem}
                onChange={(e) => setFeeItem(e.target.value)}
                placeholder="e.g. Broken microphone"
              />
              <Input
                label="Amount (PHP)"
                type="number"
                min={0}
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
              />
            </div>
            <div className="mt-3">
              <Input
                label="Note"
                value={feeNote}
                onChange={(e) => setFeeNote(e.target.value)}
              />
            </div>
            <Button
              className="mt-4"
              disabled={
                !feeGuest || !feeItem.trim() || !(Number(feeAmount) > 0)
              }
              onClick={() =>
                ask({
                  title: "Log this damage fee?",
                  body: `${peso(Number(feeAmount))} for ${feeItem.trim()} charged to ${state.guests.find((g) => g.id === feeGuest)?.name ?? "guest"}${
                    feeBooking ? ` (booking ${feeBooking})` : ""
                  }. It is deducted from their deposit before refund.`,
                  confirmLabel: "Log fee",
                  danger: true,
                  run: () => {
                    dispatch({
                      type: "ADD_DAMAGE_FEE",
                      guestId: feeGuest,
                      fee: {
                        bookingId: feeBooking || undefined,
                        item: feeItem.trim(),
                        amount: Number(feeAmount),
                        note: feeNote.trim(),
                        by: actor,
                      },
                    })
                    setFeeItem("")
                    setFeeAmount("")
                    setFeeNote("")
                  },
                })
              }
            >
              Log fee
            </Button>
          </Card>
        ) : (
          <Card className="p-5">
            <h2 className="mb-1 text-lg font-extrabold text-ink-900">
              Damage or loss fees
            </h2>
            <p className="text-xs text-slate-500">
              Cash handling is limited to front desk and cashier.
            </p>
          </Card>
        )}
      </div>

      {cash && (
        <>
          <Card className="mt-6 p-5">
            <h2 className="mb-3 text-lg font-extrabold text-ink-900">
              Unsettled fees
            </h2>
            {guestsWithFees.length === 0 ? (
              <p className="text-sm text-slate-500">
                No unsettled damage or loss fees.
              </p>
            ) : (
              <div className="space-y-4">
                {guestsWithFees.map((g) => (
                  <div key={g.id}>
                    <p className="text-sm font-extrabold text-ink-900">
                      {g.name}
                    </p>
                    <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200">
                      {(g.damageFees ?? [])
                        .filter((f) => !f.settled)
                        .map((f) => (
                          <li
                            key={f.id}
                            className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                          >
                            <span>
                              <span className="font-bold">{f.item}</span> ·{" "}
                              {peso(f.amount)}
                              <span className="block text-xs text-slate-500">
                                {prettyDateTime(f.at)} · {f.by}
                                {f.bookingId ? ` · ${f.bookingId}` : ""}
                                {f.note ? ` · ${f.note}` : ""}
                              </span>
                            </span>
                            <Button
                              variant="secondary"
                              className="min-h-9 px-3 py-1.5"
                              onClick={() =>
                                ask({
                                  title: "Settle this damage fee?",
                                  body: `${peso(f.amount)} for ${f.item} (${g.name}${
                                    f.bookingId
                                      ? `, booking ${f.bookingId}`
                                      : ""
                                  }) will be marked settled. This cannot be undone.`,
                                  confirmLabel: `Settle ${peso(f.amount)}`,
                                  danger: true,
                                  run: () =>
                                    dispatch({
                                      type: "SETTLE_DAMAGE_FEE",
                                      guestId: g.id,
                                      feeId: f.id,
                                      by: actor,
                                    }),
                                })
                              }
                            >
                              Settle
                            </Button>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="mt-6 overflow-hidden">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-lg font-extrabold text-ink-900">
                Deposit refund pre-computation
              </h2>
              <p className="text-sm text-slate-500">
                Bookings on {prettyDate(date)}: deposit held minus unsettled
                fees.
              </p>
            </div>
            {depositRows.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">
                No deposits held for this date.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-sand-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="p-3">Booking</th>
                      <th className="p-3">Deposit held</th>
                      <th className="p-3">Unsettled fees</th>
                      <th className="p-3">Refundable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {depositRows.map(({ b, held, fees }) => (
                      <tr key={b.id}>
                        <td className="p-3 font-semibold">
                          {b.guestName}
                          <span className="block text-xs font-normal text-slate-500">
                            {b.id}
                          </span>
                        </td>
                        <td className="p-3">{peso(held)}</td>
                        <td className="p-3">{peso(fees)}</td>
                        <td className="p-3 font-extrabold">
                          {peso(Math.max(0, held - fees))}
                          {fees > held && (
                            <span className="block text-xs font-semibold text-danger-600">
                              Guest still owes {peso(fees - held)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Modal
        open={!!editing}
        title={isNew ? "New add-on" : "Edit add-on"}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <div className="space-y-3">
            <Input
              label="Name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <Input
              label="Description"
              value={editing.description}
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
            />
            <div className="grid grid-cols-2 gap-3">
              {numField("price", "Rate (PHP)")}
              {numField("deposit", "Deposit (PHP)")}
              {numField("dailyCap", "Daily cap")}
              <Input
                label="Unit"
                value={editing.unit}
                onChange={(e) =>
                  setEditing({ ...editing, unit: e.target.value })
                }
              />
            </div>
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-4"
                checked={editing.active}
                onChange={(e) =>
                  setEditing({ ...editing, active: e.target.checked })
                }
              />
              Available to guests
            </label>
            <Button
              className="w-full"
              disabled={!editing.name.trim()}
              onClick={saveAddon}
            >
              Save add-on
            </Button>
          </div>
        )}
      </Modal>
      {dialog}
    </StaffLayout>
  )
}
