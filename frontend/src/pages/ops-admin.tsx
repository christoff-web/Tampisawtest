import { CloudRain, Info, RotateCcw, Save } from "lucide-react"
import { useMemo, useState } from "react"
import { ConfirmDialog } from "../components/confirm"
import { useLeaveGuard } from "../components/leave-guard"
import { AdminLayout } from "../components/layouts"
import { Badge, Button, Card, Input, PageTitle, Select } from "../components/ui"
import {
  computeLedger,
  computeOvertime,
  emptyMix,
  kindLabel,
  tierLabel,
} from "../lib/ops"
import { useTampisaw } from "../store"
import type { Booking, GuestKind, GuestMix, SessionTier, Tariff } from "../types"

const peso = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount)

const TIERS: SessionTier[] = ["day", "night", "overnight"]
const KINDS: GuestKind[] = ["adult", "child", "senior", "pwd"]
const TIER_SLOT: Record<SessionTier, string> = {
  day: "day-tour",
  night: "night-swim",
  overnight: "room-stay",
}
const TIER_SHORT: Record<SessionTier, string> = {
  day: "Day",
  night: "Night",
  overnight: "22-hour / overnight",
}

type Draft = Record<string, string>

function toDraft(t: Tariff): Draft {
  const d: Draft = {
    discount: String(t.statutoryDiscountPct),
    grace: String(t.overtime.graceMinutes),
    block: String(t.overtime.blockMinutes),
    capDay: String(t.durationCapHours.dayCottage),
    capNight: String(t.durationCapHours.nightCottage),
    expiry: String(t.expiryAlertMinutes),
  }
  for (const tier of TIERS) {
    for (const kind of KINDS) d[`rate.${tier}.${kind}`] = String(t.rates[tier][kind])
    d[`otg.${tier}`] = String(t.overtime.perGuestHour[tier])
    d[`otc.${tier}`] = String(t.overtime.perCottageHour[tier])
  }
  return d
}

const num = (v: string) => (v.trim() === "" ? NaN : Number(v))

function fromDraft(d: Draft): Tariff {
  const rates = {} as Tariff["rates"]
  const perGuestHour = {} as Tariff["overtime"]["perGuestHour"]
  const perCottageHour = {} as Tariff["overtime"]["perCottageHour"]
  for (const tier of TIERS) {
    rates[tier] = {} as Record<GuestKind, number>
    for (const kind of KINDS) rates[tier][kind] = num(d[`rate.${tier}.${kind}`])
    perGuestHour[tier] = num(d[`otg.${tier}`])
    perCottageHour[tier] = num(d[`otc.${tier}`])
  }
  return {
    rates,
    statutoryDiscountPct: num(d.discount),
    overtime: {
      perGuestHour,
      perCottageHour,
      graceMinutes: num(d.grace),
      blockMinutes: num(d.block),
    },
    durationCapHours: { dayCottage: num(d.capDay), nightCottage: num(d.capNight) },
    expiryAlertMinutes: num(d.expiry),
  }
}

function validate(d: Draft): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [key, raw] of Object.entries(d)) {
    const n = num(raw)
    if (!Number.isFinite(n)) errors[key] = "Enter a number."
    else if (n < 0) errors[key] = "Cannot be negative."
  }
  const within = (key: string, ok: boolean, msg: string) => {
    if (!errors[key] && !ok) errors[key] = msg
  }
  within("discount", num(d.discount) <= 100, "Use 0 to 100.")
  within("block", num(d.block) >= 1, "At least 1 minute.")
  within("capDay", num(d.capDay) >= 1, "At least 1 hour.")
  within("capNight", num(d.capNight) >= 1, "At least 1 hour.")
  return errors
}

function Field({
  label,
  id,
  draft,
  setDraft,
  errors,
  step = 1,
  hint,
}: {
  label: string
  id: string
  draft: Draft
  setDraft: (fn: (d: Draft) => Draft) => void
  errors: Record<string, string>
  step?: number
  hint?: string
}) {
  return (
    <div className="grid h-full grid-rows-[1fr_auto] [&>label]:h-full [&>label]:grid-rows-[1fr_auto]">
      <Input
        label={label}
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={draft[id]}
        error={errors[id]}
        aria-invalid={!!errors[id]}
        onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
      />
      {hint && !errors[id] && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function TariffsPage() {
  const { state, dispatch, currentUser } = useTampisaw()
  const saved = state.tariff
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved))
  const [confirming, setConfirming] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const { dialog: leaveDialog } = useLeaveGuard(JSON.stringify(draft) !== JSON.stringify(toDraft(saved)), "Leaving now will discard your unsaved changes.")
  const [previewTier, setPreviewTier] = useState<SessionTier>("day")
  const [previewMix, setPreviewMix] = useState<GuestMix>({ ...emptyMix(), adult: 2, child: 1, senior: 1, pwd: 1 })
  const [cottageId, setCottageId] = useState("")
  const [minutesOver, setMinutesOver] = useState("75")

  const errors = useMemo(() => validate(draft), [draft])
  const valid = Object.keys(errors).length === 0
  const candidate = useMemo(() => fromDraft(draft), [draft])
  const dirty = JSON.stringify(toDraft(saved)) !== JSON.stringify(draft)
  const live = valid ? candidate : saved

  const discountPct = Number.isFinite(num(draft.discount)) ? num(draft.discount) : saved.statutoryDiscountPct
  const effective = (rate: number) => {
    const r = Number.isFinite(rate) ? rate : 0
    return r - Math.round((r * discountPct) / 100)
  }

  const cottages = state.cottages.filter((c) => c.kind === "cottage" && c.price > 0)
  const cottage = cottages.find((c) => c.id === cottageId)
  const ledger = computeLedger(live, TIER_SLOT[previewTier], previewMix, cottage?.price ?? 0)
  const over = Math.max(0, Number(minutesOver) || 0)
  const sampleGuests = Math.max(1, previewMix.adult + previewMix.child + previewMix.senior + previewMix.pwd)
  const overtime = computeOvertime(
    live,
    { slotId: TIER_SLOT[previewTier], guests: sampleGuests } as Booking,
    new Date(Date.UTC(2026, 0, 1, 0, over)),
    new Date(Date.UTC(2026, 0, 1, 0, 0)),
    !!cottage,
  )
  const rowTotal = ledger.total

  const save = () => {
    dispatch({ type: "SAVE_TARIFF", tariff: candidate, by: currentUser?.name ?? "Admin" })
    setConfirming(false)
    setJustSaved(true)
    setDraft(toDraft(candidate))
  }
  const fieldProps = { draft, setDraft, errors }
  const changed = (a: number, b: number) => (a !== b ? "text-aqua-700" : "text-slate-400")

  return (
    <AdminLayout>
      {leaveDialog}
      <PageTitle
        eyebrow="Pricing"
        title="Tariffs & overtime"
        description="Edit admission rates, the statutory discount, overtime and cottage limits without touching code. New rates apply to bookings made after you save."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {dirty && <Badge tone="warning">Unsaved changes</Badge>}
            {!dirty && justSaved && <Badge tone="success">Saved</Badge>}
            <Button
              variant="secondary"
              disabled={!dirty}
              onClick={() => {
                setDraft(toDraft(saved))
                setJustSaved(false)
              }}
            >
              <RotateCcw size={16} /> Discard
            </Button>
            <Button disabled={!dirty || !valid} onClick={() => setConfirming(true)}>
              <Save size={16} /> Save tariff
            </Button>
          </div>
        }
      />
      {!valid && (
        <Card className="mb-5 border-danger-200 bg-danger-50 p-4 text-sm font-semibold text-danger-800">
          Fix the highlighted fields before saving. Every value must be a non-negative number.
        </Card>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-6">
          <Card className="overflow-hidden">
            <div className="border-b p-5">
              <h2 className="text-lg font-extrabold">Admission rates (per head)</h2>
              <p className="mt-1 text-xs text-slate-500">
                Senior citizen and PWD rows are the base rate. The {discountPct}% statutory discount is applied automatically at billing.
              </p>
            </div>
            <div className="overflow-x-auto p-5">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="pb-3 pr-3 font-bold">Guest</th>
                    {TIERS.map((tier) => (
                      <th key={tier} className="pb-3 pr-3 font-bold">
                        {TIER_SHORT[tier]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {KINDS.map((kind) => (
                    <tr key={kind} className="align-top">
                      <th className="py-2 pr-3 pt-5 text-left font-bold">{kindLabel[kind]}</th>
                      {TIERS.map((tier) => {
                        const id = `rate.${tier}.${kind}`
                        const statutory = kind === "senior" || kind === "pwd"
                        return (
                          <td key={tier} className="py-2 pr-3">
                            <input
                              aria-label={`${kindLabel[kind]} ${TIER_SHORT[tier]} rate`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              value={draft[id]}
                              aria-invalid={!!errors[id]}
                              onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))}
                              className={`min-h-11 w-full rounded-xl border bg-white px-3 text-base outline-none focus:ring-4 ${
                                errors[id]
                                  ? "border-danger-400 focus:border-danger-500 focus:ring-danger-100"
                                  : "border-slate-300 focus:border-aqua-500 focus:ring-aqua-100"
                              }`}
                            />
                            {errors[id] ? (
                              <span className="mt-1 block text-xs font-medium text-danger-600">{errors[id]}</span>
                            ) : statutory ? (
                              <span className="mt-1 block text-xs text-slate-500">
                                Pays <b className="text-success-700">{peso(effective(num(draft[id])))}</b>
                              </span>
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-extrabold">Statutory discount</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field {...fieldProps} id="discount" label="Senior / PWD discount (%)" hint="Applied to the base rate of Senior and PWD guests only. Default is 20%." />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-extrabold">Overtime</h2>
            <p className="mt-1 text-xs text-slate-500">
              After the grace period, each started block is billed per guest and per cottage.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {TIERS.map((tier) => (
                <Field key={tier} {...fieldProps} id={`otg.${tier}`} label={`${TIER_SHORT[tier]}: per guest-hour (PHP)`} />
              ))}
              {TIERS.map((tier) => (
                <Field key={tier} {...fieldProps} id={`otc.${tier}`} label={`${TIER_SHORT[tier]}: per cottage-hour (PHP)`} />
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field {...fieldProps} id="grace" label="Grace period (minutes)" hint="No overtime is billed within this window." />
              <Field {...fieldProps} id="block" label="Billing block (minutes)" hint="60 bills every started hour." />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-extrabold">Cottage limits & alerts</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field {...fieldProps} id="capDay" label="Day cottage cap (hours)" hint="Longest single day rental." />
              <Field {...fieldProps} id="capNight" label="Night cottage cap (hours)" hint="Longest single night rental." />
              <Field {...fieldProps} id="expiry" label="Expiry alert (minutes before end)" hint="Staff and guest are alerted at this point." />
            </div>
          </Card>
        </div>

        <div className="grid content-start gap-6 xl:sticky xl:top-6">
          <Card className="p-5">
            <h2 className="text-lg font-extrabold">Live bill preview</h2>
            <p className="mt-1 text-xs text-slate-500">
              Uses the values on screen{valid ? "" : " (last saved, until errors are fixed)"}.
            </p>
            <div className="mt-4 grid gap-3">
              <Select label="Session" value={previewTier} onChange={(e) => setPreviewTier(e.target.value as SessionTier)}>
                {TIERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {tierLabel[tier]}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                {KINDS.map((kind) => (
                  <Input
                    key={kind}
                    label={kindLabel[kind]}
                    type="number"
                    min={0}
                    value={previewMix[kind]}
                    onChange={(e) =>
                      setPreviewMix((m) => ({ ...m, [kind]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))
                    }
                  />
                ))}
              </div>
              <Select label="Cottage (optional)" value={cottageId} onChange={(e) => setCottageId(e.target.value)}>
                <option value="">No cottage</option>
                {cottages.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {peso(c.price)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="mt-5 rounded-xl bg-sand-100 p-4 text-sm">
              {ledger.lines.length === 0 && <p className="text-slate-500">Add at least one guest to see a bill.</p>}
              {ledger.lines.map((line) => (
                <div key={line.kind} className="flex justify-between gap-3 py-1">
                  <span>
                    {line.qty} x {kindLabel[line.kind]} @ {peso(line.rate)}
                    {line.discount > 0 && <span className="ml-1 text-success-700">(-{peso(line.discount)})</span>}
                  </span>
                  <b>{peso(line.net)}</b>
                </div>
              ))}
              {ledger.cottage > 0 && (
                <div className="flex justify-between py-1">
                  <span>{cottage?.name}</span>
                  <b>{peso(ledger.cottage)}</b>
                </div>
              )}
              {ledger.discount > 0 && (
                <p className="mt-1 text-xs text-success-700">Statutory discount applied: {peso(ledger.discount)}</p>
              )}
              <div className="mt-2 flex justify-between border-t border-slate-300 pt-3 text-base">
                <span className="font-extrabold">Total</span>
                <span className="font-extrabold text-aqua-700">{peso(rowTotal)}</span>
              </div>
            </div>
            <div className="mt-5 grid gap-3">
              <Input
                label="Sample overtime (minutes past end)"
                type="number"
                min={0}
                value={minutesOver}
                onChange={(e) => setMinutesOver(e.target.value)}
              />
              <div className="rounded-xl bg-aqua-50 p-4 text-sm">
                {overtime.fee > 0 ? (
                  <p>
                    {overtime.minutesOver} min over bills <b>{overtime.billedHours} h</b> for {sampleGuests} guest
                    {sampleGuests === 1 ? "" : "s"}
                    {cottage ? " and the cottage" : ""}: <b className="text-aqua-800">{peso(overtime.fee)}</b>
                  </p>
                ) : (
                  <p>
                    {overtime.minutesOver} min over is within the {live.overtime.graceMinutes}-minute grace period. No
                    overtime fee.
                  </p>
                )}
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex gap-3 text-sm leading-6 text-slate-600">
              <Info className="mt-0.5 shrink-0 text-aqua-700" size={18} />
              <p>
                Compared with the saved tariff, the Adult day rate is{" "}
                <b className={changed(num(draft["rate.day.adult"]), saved.rates.day.adult)}>
                  {peso(Number.isFinite(num(draft["rate.day.adult"])) ? num(draft["rate.day.adult"]) : 0)}
                </b>{" "}
                (was {peso(saved.rates.day.adult)}). Every save is recorded in the audit log.
              </p>
            </div>
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Save new tariff?"
        confirmLabel="Save tariff"
        onCancel={() => setConfirming(false)}
        onConfirm={save}
      >
        {saved.statutoryDiscountPct !== candidate.statutoryDiscountPct && (
          <>
            Statutory discount changes from {saved.statutoryDiscountPct}% to {candidate.statutoryDiscountPct}%.{" "}
          </>
        )}
        {saved.rates.day.adult !== candidate.rates.day.adult && (
          <>
            Adult day rate changes from {peso(saved.rates.day.adult)} to {peso(candidate.rates.day.adult)}.{" "}
          </>
        )}
        Rates, the {discountPct}% statutory discount, overtime and cottage limits will update immediately for new bookings
        and overtime billing. The change is recorded under {currentUser?.name ?? "Admin"} in the audit log.
      </ConfirmDialog>
    </AdminLayout>
  )
}

const ACTIVE_FOR_WEATHER = ["pending", "reserved", "confirmed"]

type Outcome = {
  mode: "refund" | "reschedule"
  date: string
  newDate?: string
  count: number
  refunded: number
  notices: number
}

export function WeatherPage() {
  const { state, dispatch, currentUser } = useTampisaw()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [slotId, setSlotId] = useState("")
  const [mode, setMode] = useState<"refund" | "reschedule">("refund")
  const [newDate, setNewDate] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const affected = state.bookings.filter(
    (b) => b.date === date && (!slotId || b.slotId === slotId) && ACTIVE_FOR_WEATHER.includes(b.status),
  )
  const [picked, setPicked] = useState<string[]>([])
  const chosen = affected.filter((b) => picked.includes(b.id))
  const allPicked = affected.length > 0 && chosen.length === affected.length
  const togglePick = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const paidTotal = chosen.reduce((s, b) => s + b.paid, 0)
  const guestTotal = chosen.reduce((s, b) => s + b.guests, 0)
  const slotName = (id: string) => state.slots.find((s) => s.id === id)?.label ?? id
  const scope = slotId ? slotName(slotId) : "all slots"
  const newDateError =
    mode !== "reschedule"
      ? ""
      : !newDate
        ? "Choose the new date."
        : newDate < today
          ? "The new date cannot be in the past."
          : newDate === date
            ? "Pick a different date from the affected day."
            : ""
  const canRun = chosen.length > 0 && !newDateError && !!date
  const pretty = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" })

  const reasonPreview =
    mode === "refund"
      ? `Weather advisory: your ${pretty(date)} booking was cancelled and fully refunded (or no payment was due).`
      : `Weather advisory: your booking was moved to ${newDate ? pretty(newDate) : "the new date"}. Reply to staff if that date does not work.`

  const run = () => {
    dispatch({
      type: "WEATHER_CANCEL",
      date,
      slotId: slotId || undefined,
      mode,
      newDate: mode === "reschedule" ? newDate : undefined,
      ids: chosen.map((b) => b.id),
      by: currentUser?.name ?? "Admin",
    })
    setOutcome({
      mode,
      date,
      newDate: mode === "reschedule" ? newDate : undefined,
      count: chosen.length,
      refunded: mode === "refund" ? paidTotal : 0,
      notices: chosen.length,
    })
    setPicked([])
    setConfirming(false)
  }

  const recent = state.auditLog.filter((e) => e.action.startsWith("Weather protocol")).slice(0, 8)

  return (
    <AdminLayout>
      <PageTitle
        eyebrow="Operations"
        title="Inclement weather protocol"
        description="Refund or reschedule the selected bookings in one step. Guests are notified, refunds are logged and the date is blocked for new reservations."
      />
      {outcome && (
        <Card className="mb-6 border-success-200 bg-success-50 p-5">
          <h2 className="text-lg font-extrabold text-success-900">Protocol applied</h2>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <p>
              <b className="block text-2xl">{outcome.count}</b> bookings{" "}
              {outcome.mode === "refund" ? "cancelled" : `moved to ${pretty(outcome.newDate ?? outcome.date)}`}
            </p>
            <p>
              <b className="block text-2xl">{peso(outcome.refunded)}</b> refunded
            </p>
            <p>
              <b className="block text-2xl">{outcome.notices}</b> guest notices sent
            </p>
          </div>
          <p className="mt-3 text-xs text-success-800">
            {pretty(outcome.date)} is now blocked as a weather closure. Remove it from Slots & capacity when the resort reopens.
          </p>
        </Card>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="grid content-start gap-6">
          <Card className="p-5">
            <h2 className="text-lg font-extrabold">1. Choose the affected day</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input label="Date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setPicked([]); setOutcome(null) }} />
              <Select label="Slot (optional)" value={slotId} onChange={(e) => { setSlotId(e.target.value); setPicked([]); setOutcome(null) }}>
                <option value="">All slots</option>
                {state.slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-5">
              <div>
                <h2 className="text-lg font-extrabold">2. Affected bookings</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Pending, reserved and confirmed bookings. Guests already checked in are not touched. Tick one or more accounts to act on.
                </p>
              </div>
              <Badge tone={chosen.length ? "warning" : "neutral"}>
                {chosen.length} of {affected.length} selected · {guestTotal} guests · {peso(paidTotal)} paid
              </Badge>
            </div>
            {affected.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b bg-slate-50 px-5 py-3">
                <Button variant="secondary" className="!min-h-9" disabled={allPicked} onClick={() => setPicked(affected.map((b) => b.id))}>
                  Select all
                </Button>
                <Button variant="secondary" className="!min-h-9" disabled={!chosen.length} onClick={() => setPicked([])}>
                  Clear
                </Button>
              </div>
            )}
            <div className="divide-y">
              {affected.map((b) => (
                <label key={b.id} className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="size-5 accent-aqua-600"
                    checked={picked.includes(b.id)}
                    onChange={() => togglePick(b.id)}
                    aria-label={`Select ${b.guestName}, booking ${b.id}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {b.guestName} <span className="font-normal text-slate-400">· {b.id}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {slotName(b.slotId)} · {b.guests} guests · {b.type}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold">{peso(b.paid)}</p>
                    <p className="text-xs text-slate-400">of {peso(b.total)}</p>
                  </div>
                </label>
              ))}
              {!affected.length && (
                <p className="p-8 text-center text-sm text-slate-500">
                  No active bookings on {pretty(date)} for {scope}.
                </p>
              )}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="text-lg font-extrabold">3. Choose the guest remedy</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["refund", "Refund", "Cancel the selected bookings and refund what each guest paid in full."],
                  ["reschedule", "Reschedule", "Keep the selected bookings and move them to a new date."],
                ] as const
              ).map(([id, title, text]) => (
                <label
                  key={id}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    mode === id ? "border-aqua-500 bg-aqua-50 ring-2 ring-aqua-100" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="weather-mode"
                    className="sr-only"
                    checked={mode === id}
                    onChange={() => setMode(id)}
                  />
                  <span className="block font-extrabold">{title}</span>
                  <span className="mt-1 block text-sm text-slate-500">{text}</span>
                </label>
              ))}
            </div>
            {mode === "reschedule" && (
              <div className="mt-4 max-w-xs">
                <Input
                  label="New date"
                  type="date"
                  min={today}
                  value={newDate}
                  error={newDate ? newDateError : ""}
                  onChange={(e) => setNewDate(e.target.value)}
                />
              </div>
            )}
            <div className="mt-5 rounded-xl bg-sand-100 p-4 text-sm leading-6">
              <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Guest notice preview</p>
              <p className="mt-1">{reasonPreview}</p>
              <p className="mt-2 text-xs text-slate-500">Recorded reason: Inclement weather.</p>
            </div>
            <Button className="mt-5" variant="danger" disabled={!canRun} onClick={() => setConfirming(true)}>
              <CloudRain size={17} /> {mode === "refund" ? "Cancel & refund" : "Reschedule"}{chosen.length ? ` (${chosen.length})` : ""}
            </Button>
          </Card>
        </div>
        <Card className="content-start overflow-hidden xl:self-start">
          <div className="border-b p-5">
            <h2 className="text-lg font-extrabold">Recent weather actions</h2>
            <p className="mt-1 text-xs text-slate-500">From the audit log.</p>
          </div>
          <div className="divide-y">
            {recent.map((e) => (
              <div key={e.id} className="p-4">
                <p className="text-sm font-bold">{e.action}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {e.actor} ·{" "}
                  {new Date(e.at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            ))}
            {!recent.length && <p className="p-6 text-sm text-slate-500">No weather protocol has been run yet.</p>}
          </div>
        </Card>
      </div>
      <ConfirmDialog
        open={confirming}
        danger
        title={mode === "refund" ? "Cancel and refund the selected bookings?" : "Reschedule the selected bookings?"}
        confirmLabel={mode === "refund" ? `Cancel ${chosen.length} & refund ${peso(paidTotal)}` : `Move ${chosen.length} to ${newDate ? pretty(newDate) : "new date"}`}
        onCancel={() => setConfirming(false)}
        onConfirm={run}
      >
        {mode === "refund" ? (
          <>
            {chosen.length} selected booking{chosen.length === 1 ? "" : "s"} on {pretty(date)} ({scope}) will be cancelled and {peso(paidTotal)} refunded in
            full. Each guest is notified. {pretty(date)} will also be blocked for new reservations. This cannot be undone.
          </>
        ) : (
          <>
            {chosen.length} selected booking{chosen.length === 1 ? "" : "s"} on {pretty(date)} ({scope}) will move to {newDate ? pretty(newDate) : "the new date"}.
            Each guest is notified, and the original date is blocked for new reservations.
          </>
        )}
      </ConfirmDialog>
    </AdminLayout>
  )
}
