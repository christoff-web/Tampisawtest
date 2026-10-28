import { ProofViewer } from "../components/proof"
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  Printer,
  Receipt,
  Search,
  ShieldAlert,
  Siren,
  Watch,
  Wrench,
  X,
} from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { AdminLayout, StaffLayout } from "../components/layouts"
import { Badge, Button, Card, Input, Modal, PageTitle, Select, StatCard, StatusBadge } from "../components/ui"
import {
  balanceOf,
  braceletColor,
  hoursUntil,
  isWithinCutoff,
  peso,
  prettyDate,
  prettyDateTime,
  slotLabels,
} from "../lib/rules"
import { ConfirmDialog, useConfirm } from "../components/confirm"
import { arrivalLabel, bookingSourceLabel, canHandleCash, isAdminRole, paymentMethodLabel, paymentOptionLabel, paymentProgress } from "../lib/ops"
import { matchesGuest, SEARCH_PLACEHOLDER } from "../lib/search"
import { useTampisaw } from "../store"
import type { Booking, Incident, MaintenanceRequest } from "../types"

/* ------------------------------------------------------------------ */
/* shared bits                                                         */
/* ------------------------------------------------------------------ */

type Tone = "neutral" | "success" | "warning" | "danger" | "info"

function Tabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string
  tabs: { id: T; label: string; badge?: number }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition ${
              value === t.id
                ? "border-aqua-600 bg-aqua-600 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:border-aqua-300 hover:bg-aqua-50"
            }`}
          >
            {t.label}
            {!!t.badge && (
              <span className={`rounded-full px-1.5 text-xs font-extrabold ${value === t.id ? "bg-white/25 text-white" : "bg-danger-500 text-white"}`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink-800">
      {label}
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base font-normal outline-none transition placeholder:text-slate-400 focus:border-aqua-500 focus:ring-4 focus:ring-aqua-100"
      />
    </label>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">{children}</div>
}

function Question({ n, children }: { n?: number; children: ReactNode }) {
  return (
    <p className="mb-3 flex items-start gap-2 text-sm font-extrabold text-ink-900">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-warning-100 text-xs text-warning-800">{n ?? "?"}</span>
      {children}
    </p>
  )
}

function YesNo({ value, onChange, yes = "Yes", no = "No" }: { value: boolean | null; onChange: (v: boolean) => void; yes?: string; no?: string }) {
  const base = "min-h-11 rounded-xl border px-5 text-sm font-bold transition"
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => onChange(true)} className={`${base} ${value === true ? "border-success-600 bg-success-600 text-white" : "border-slate-200 bg-white hover:bg-success-50"}`}>
        {yes}
      </button>
      <button onClick={() => onChange(false)} className={`${base} ${value === false ? "border-danger-600 bg-danger-600 text-white" : "border-slate-200 bg-white hover:bg-danger-50"}`}>
        {no}
      </button>
    </div>
  )
}

function Note({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const t = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-success-200 bg-success-50 text-success-900",
    warning: "border-warning-200 bg-warning-50 text-warning-900",
    danger: "border-danger-200 bg-danger-50 text-danger-900",
  }[tone]
  return <div className={`rounded-xl border p-4 text-sm leading-6 ${t}`}>{children}</div>
}

const th = "px-4 py-3 text-left text-xs font-extrabold uppercase tracking-wide text-slate-500"
const td = "px-4 py-3 align-middle text-sm"

function duration(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

function serviceLabel(b: Booking, cottageName?: string) {
  const base = b.type === "pool" ? "Pool" : b.type === "cottage" ? "Cottage" : b.type === "room" ? "Room" : "Event"
  return cottageName ? `${base} · ${cottageName}` : base
}

const activeStatuses: Booking["status"][] = ["pending", "reserved", "confirmed", "checked-in", "cancellation-requested"]

/* ------------------------------------------------------------------ */
/* PAYMENTS, RECEIPTS & REFUNDS  (flowchart page 8)                    */
/* ------------------------------------------------------------------ */

type PayTab = "payments" | "balance" | "cancel"

export function PaymentsRefundsPage() {
  const { state } = useTampisaw()
  const [params] = useSearchParams()
  const preselect = params.get("booking")
  const [tab, setTab] = useState<PayTab>(preselect ? "cancel" : "payments")
  const proofs = state.bookings.filter((b) => b.paymentStatus === "submitted").length
  const cancels = state.bookings.filter((b) => b.status === "cancellation-requested").length
  const balances = state.bookings.filter((b) => b.type !== "pool" && b.paid > 0 && balanceOf(b) > 0 && activeStatuses.includes(b.status)).length
  return (
    <StaffLayout>
      <PageTitle
        eyebrow="Receptionist · Payments, receipts and refunds"
        title="Payments & refunds"
        description="A payment event occurred: a booking payment, a balance payment, a receipt is needed, or a cancellation was requested (online or walk-in)."
      />
      <Tabs
        label="Which task?"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "payments", label: "Payments & receipts", badge: proofs },
          { id: "balance", label: "Balance payment", badge: balances },
          { id: "cancel", label: "Cancel, refund or deposit", badge: cancels },
        ]}
      />
      {tab === "payments" && <PaymentsTab />}
      {tab === "balance" && <BalanceTab />}
      {tab === "cancel" && <CancelTab preselect={preselect} />}
    </StaffLayout>
  )
}

function receiptKind(b: Booking): "official" | "reserved" | "none" {
  if (b.paid > 0 && b.paid >= b.total) return "official"
  if (b.paid > 0 && b.paymentStatus === "verified") return "reserved"
  return "none"
}

function ReceiptBadge({ b }: { b: Booking }) {
  const k = receiptKind(b)
  return k === "official" ? <Badge tone="success">Official receipt</Badge> : k === "reserved" ? <Badge tone="warning">RESERVED receipt</Badge> : <Badge>No receipt</Badge>
}

function PaymentsTab() {
  const { state, dispatch, currentUser } = useTampisaw()
  const actor = currentUser?.name ?? "Receptionist"
  const cash = canHandleCash(currentUser?.role)
  const { ask, dialog } = useConfirm()
  const [receipt, setReceipt] = useState<Booking | null>(null)
  const [q, setQ] = useState("")
  const [source, setSource] = useState<"all" | "online" | "walk-in">("all")
  const [method, setMethod] = useState<"all" | "Cash" | "E-Wallet">("all")
  const [limit, setLimit] = useState(25)
  const [rejecting, setRejecting] = useState<Booking | null>(null)
  const queue = state.bookings.filter((b) => b.paymentStatus === "submitted")
  const matching = state.bookings
    .filter((b) => !["cancelled", "expired"].includes(b.status))
    .filter((b) => matchesGuest(q, { id: b.id, name: b.guestName, email: b.email, phone: b.phone }))
    .filter((b) => source === "all" || (b.source ?? "online") === source)
    .filter((b) => method === "all" || paymentMethodLabel(b) === method)
  const rows = matching.slice(0, limit)
  const cottageName = (b: Booking) => state.cottages.find((c) => c.id === b.cottageId)?.name
  return (
    <div className="grid gap-6">
      <Card className="p-5">
        <h2 className="text-lg font-extrabold">Proof-of-payment queue</h2>
        <p className="mb-4 text-sm text-slate-500">
          Pool appointments: full payment (online or at the counter). Cottage / room / event: only the {state.settings.downpaymentPct}% downpayment is required to reserve.
        </p>
        {queue.length === 0 ? (
          <Empty>No proofs waiting for verification.</Empty>
        ) : (
          <div className="grid gap-3">
            {!cash && <p className="text-xs text-slate-500">Cash handling is limited to front desk and cashier.</p>}
            {queue.map((b) => (
              <div key={b.id} className="flex flex-col gap-3 rounded-xl border border-warning-200 bg-warning-50/60 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-extrabold">
                    {b.id} · {b.guestName}
                  </p>
                  <p className="text-sm text-slate-600">
                    {serviceLabel(b, cottageName(b))} · {prettyDate(b.date)} · {slotLabels[b.slotId] ?? b.slotId} · {b.guests} pax
                  </p>
                  {arrivalLabel(b) && (
                    <p className="text-sm font-semibold text-aqua-800">
                      Arrival: {arrivalLabel(b)}
                    </p>
                  )}
                  <p className="text-sm text-slate-600">
                    Contact: <b>{b.phone || "—"}</b> · Paid by: <b>{paymentMethodLabel(b)}</b> · {bookingSourceLabel(b.source)}
                  </p>
                  <p className="text-sm text-slate-600">
                    Proof: <b>{b.proofName ?? "uploaded"}</b> · Expected {peso(b.dueNow ?? b.total)}
                    {b.dueNow !== undefined && b.dueNow < b.total && " (downpayment)"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                <ProofViewer name={b.proofName} image={b.proofImage} method={b.paymentMethod === "cash" ? "Cash" : "QR payment"} amount={b.dueNow ?? b.total} />
                {cash && (
                  <>
                    {b.staffApproval && !isAdminRole(currentUser?.role) ? (
                      <Badge tone="warning">Awaiting admin confirmation</Badge>
                    ) : (
                    <Button
                      onClick={() =>
                        ask({
                          title: isAdminRole(currentUser?.role) ? "Confirm the money was received?" : "Send proof to admin?",
                          body: isAdminRole(currentUser?.role)
                            ? `${b.id} (${b.guestName}): ${peso(b.dueNow ?? b.total)}. Only continue if you checked your own bank or GCash account and the money is really there.`
                            : `${b.id} (${b.guestName}): you confirm the proof ${b.proofName ?? "uploaded"} matches ${peso(b.dueNow ?? b.total)}. The booking stays pending until the admin confirms the money arrived.`,
                          confirmLabel: isAdminRole(currentUser?.role) ? "Yes, payment received" : "Send to admin",
                          run: () => dispatch({ type: "VERIFY_PAYMENT", id: b.id, approved: true, by: actor, byRole: currentUser?.role }),
                        })
                      }
                    >
                      <Check size={16} /> {isAdminRole(currentUser?.role) ? "Confirm received" : "Send to admin"}
                    </Button>
                    )}
                    <Button variant="danger" onClick={() => setRejecting(b)}>
                      <X size={16} /> Reject
                    </Button>
                  </>
                )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-extrabold">Bookings, payment status & receipts</h2>
            <p className="text-sm text-slate-500">Official receipt applies only to confirmed guests with full payment.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Select label="Source" value={source} onChange={(e) => { setSource(e.target.value as typeof source); setLimit(25) }}>
              <option value="all">All</option>
              <option value="online">Online</option>
              <option value="walk-in">Walk-in</option>
            </Select>
            <Select label="Payment method" value={method} onChange={(e) => { setMethod(e.target.value as typeof method); setLimit(25) }}>
              <option value="all">All</option>
              <option value="Cash">Cash</option>
              <option value="E-Wallet">E-Wallet</option>
            </Select>
          </div>
          <div className="relative sm:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={SEARCH_PLACEHOLDER}
              aria-label="Search name, email or mobile"
              className="min-h-11 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-aqua-500 focus:ring-4 focus:ring-aqua-100"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px]">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Booking</th>
                <th className={th}>Contact</th>
                <th className={th}>Source</th>
                <th className={th}>Service</th>
                <th className={th}>Paid / Total</th>
                <th className={th}>Paid by</th>
                <th className={th}>Payment</th>
                <th className={th}>Status</th>
                <th className={th}>Receipt</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className={td}>
                    <p className="font-bold">{b.id}</p>
                    <p className="text-xs text-slate-500">{b.guestName}</p>
                  </td>
                  <td className={td}>{b.phone || "—"}</td>
                  <td className={td}>
                    <Badge tone={b.source === "walk-in" ? "warning" : "info"}>{bookingSourceLabel(b.source)}</Badge>
                  </td>
                  <td className={td}>
                    {serviceLabel(b, cottageName(b))}
                    <p className="text-xs text-slate-500">{prettyDate(b.date)}</p>
                  </td>
                  <td className={td}>
                    <b>{peso(b.paid)}</b> / {peso(b.total)}
                    {balanceOf(b) > 0 && <p className="text-xs text-warning-700">Balance {peso(balanceOf(b))}</p>}
                  </td>
                  <td className={td}>
                    <Badge tone={paymentMethodLabel(b) === "Cash" ? "neutral" : paymentMethodLabel(b) === "E-Wallet" ? "info" : "warning"}>{paymentMethodLabel(b)}</Badge>
                    <p className="mt-1 text-xs text-slate-500">{paymentOptionLabel(b.paymentOption)}</p>
                    <p className="text-xs font-semibold text-slate-600">{paymentProgress(b)}</p>
                  </td>
                  <td className={td}>
                    <Badge tone={b.paymentStatus === "verified" ? "success" : b.paymentStatus === "submitted" ? "info" : b.paymentStatus === "rejected" ? "danger" : "warning"}>{b.paymentStatus}</Badge>
                  </td>
                  <td className={td}>
                    <StatusBadge status={b.status} />
                  </td>
                  <td className={td}>
                    <ReceiptBadge b={b} />
                  </td>
                  <td className={td}>
                    <Button variant="secondary" className="min-h-9 px-3" disabled={receiptKind(b) === "none"} onClick={() => setReceipt(b)}>
                      <Receipt size={15} /> View
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className={td} colSpan={10}>
                    <Empty>{state.bookings.length === 0 ? "No bookings have been made yet." : "No bookings match these filters."}</Empty>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {matching.length > rows.length && (
          <div className="flex items-center justify-between gap-3 border-t p-4 text-sm">
            <span className="text-slate-500">Showing {rows.length} of {matching.length}</span>
            <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => setLimit(limit + 25)}>Show 25 more</Button>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!rejecting}
        danger
        title="Reject this payment proof?"
        confirmLabel="Reject proof"
        onCancel={() => setRejecting(null)}
        onConfirm={() => {
          if (rejecting) dispatch({ type: "VERIFY_PAYMENT", id: rejecting.id, approved: false, by: actor })
          setRejecting(null)
        }}
      >
        Proof for {rejecting?.id} ({rejecting?.guestName}) for {peso(rejecting?.dueNow ?? rejecting?.total ?? 0)} will be marked rejected and the guest will need to upload a new one.
      </ConfirmDialog>
      {dialog}

      <Modal open={!!receipt} title="Receipt" onClose={() => setReceipt(null)}>
        {receipt && <ReceiptView b={receipt} cottageName={cottageName(receipt)} />}
      </Modal>
    </div>
  )
}

function ReceiptView({ b, cottageName }: { b: Booking; cottageName?: string }) {
  const kind = receiptKind(b)
  const official = kind === "official"
  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white p-5">
        {!official && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-6xl font-black uppercase tracking-widest text-warning-500/15 [transform:rotate(-24deg)]">
            Reserved
          </span>
        )}
        <div className="relative">
          <p className="text-center text-xs font-extrabold uppercase tracking-[0.2em] text-slate-500">Golden Pyramid Swimming Pool</p>
          <p className={`mt-1 text-center text-xl font-black ${official ? "text-success-700" : "text-warning-700"}`}>{official ? "OFFICIAL RECEIPT" : "RESERVED"}</p>
          <p className="mb-4 text-center text-xs text-slate-500">{official ? "Paid in full" : "30% downpayment received - not an official receipt"}</p>
          <dl className="grid gap-2 text-sm">
            {[
              ["Reservation code", b.id],
              ["Guest", b.guestName],
              ["Service", serviceLabel(b, cottageName)],
              ["Date", prettyDate(b.date)],
              ["Slot", slotLabels[b.slotId] ?? b.slotId],
              ["Pax", String(b.guests)],
              ["Amount paid", peso(b.paid)],
              ["Total", peso(b.total)],
              ["Balance", peso(balanceOf(b))],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-1.5">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-center text-xs text-slate-500">Code and QR are generated after payment. Show this receipt at check-in.</p>
        </div>
      </div>
      <Button className="mt-4 w-full" onClick={() => window.print()}>
        <Printer size={16} /> Print receipt
      </Button>
    </div>
  )
}

function BalanceTab() {
  const { state, dispatch, currentUser } = useTampisaw()
  const actor = currentUser?.name ?? "Receptionist"
  const cash = canHandleCash(currentUser?.role)
  const { ask, dialog } = useConfirm()
  const [who, setWho] = useState<Record<string, "counter" | "online">>({})
  const list = state.bookings.filter((b) => b.type !== "pool" && b.paid > 0 && balanceOf(b) > 0 && activeStatuses.includes(b.status) && b.status !== "cancellation-requested")
  const paidUp = state.bookings.filter((b) => b.type !== "pool" && b.receipt === "official" && b.dueNow !== undefined && b.dueNow < b.total && activeStatuses.includes(b.status)).slice(0, 4)
  const [receipt, setReceipt] = useState<Booking | null>(null)
  return (
    <div className="grid gap-6">
      <Card className="p-5">
        <h2 className="text-lg font-extrabold">Cottage reservations with a pending balance</h2>
        <p className="mb-4 text-sm text-slate-500">A RESERVED cottage has a 70% balance pending (shown in the guest app as pending balance).</p>
        {list.length === 0 ? (
          <Empty>No pending balances. Every cottage reservation is paid in full.</Empty>
        ) : (
          <div className="grid gap-4">
            {list.map((b) => {
              const choice = who[b.id] ?? (b.source === "walk-in" ? "counter" : "online")
              return (
                <div key={b.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold">
                        {b.id} · {b.guestName} <StatusBadge status={b.status} />
                      </p>
                      <p className="text-sm text-slate-500">
                        {serviceLabel(b, state.cottages.find((c) => c.id === b.cottageId)?.name)} · {prettyDate(b.date)} · {b.source === "walk-in" ? "Walk-in" : "Online"} guest
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold uppercase text-slate-500">Balance pending</p>
                      <p className="text-2xl font-black text-warning-700">{peso(balanceOf(b))}</p>
                      <p className="text-xs text-slate-500">Paid {peso(b.paid)} of {peso(b.total)}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4">
                    {!cash && <p className="text-xs text-slate-500">Cash handling is limited to front desk and cashier.</p>}
                    <Question>Who pays the balance?</Question>
                    <div className="flex flex-wrap gap-2">
                      {(["counter", "online"] as const).map((o) => (
                        <button
                          key={o}
                          onClick={() => setWho({ ...who, [b.id]: o })}
                          className={`min-h-11 rounded-xl border px-4 text-sm font-bold ${choice === o ? "border-aqua-600 bg-aqua-600 text-white" : "border-slate-200 bg-white hover:bg-aqua-50"}`}
                        >
                          {o === "counter" ? "Counter (receptionist collects)" : "Online guest"}
                        </button>
                      ))}
                    </div>
                    {choice === "counter" && cash ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <Note tone="info">Collect {peso(balanceOf(b))} at the counter (usually at check-in). Balance becomes 0, status Confirmed, official receipt replaces the RESERVED receipt.</Note>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold">Paid by:</span>
                          {(["cash", "gcash"] as const).map((m) => (
                            <Button
                              key={m}
                              variant={m === "cash" ? "primary" : "secondary"}
                              onClick={() =>
                                ask({
                                  title: `Collect ${peso(balanceOf(b))} by ${m === "cash" ? "cash" : "GCash"}?`,
                                  body: `${b.id} (${b.guestName}), ${prettyDate(b.date)}. Record ${peso(balanceOf(b))} received via ${m === "cash" ? "cash" : "GCash"}. Balance becomes 0, status Confirmed and an official receipt is issued. This cannot be undone.`,
                                  confirmLabel: `Collect ${peso(balanceOf(b))}`,
                                  run: () => dispatch({ type: "COLLECT_PAYMENT", id: b.id, amount: balanceOf(b), by: actor, method: m }),
                                })
                              }
                            >
                              <Banknote size={16} /> {m === "cash" ? "Cash" : "GCash"} {peso(balanceOf(b))}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : choice === "counter" ? null : (
                      <div className="grid gap-3">
                        {b.balanceProof?.status === "submitted" ? (
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning-200 bg-warning-50 p-3">
                            <p className="text-sm">
                              Balance proof uploaded: <b>{b.balanceProof.name}</b> · expected {peso(balanceOf(b))}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <ProofViewer name={b.balanceProof.name} image={b.balanceProof.image} />
                              {cash && (
                                <>
                                  <Button
                                    onClick={() =>
                                      ask({
                                        title: "Approve balance payment?",
                                        body: `${b.id} (${b.guestName}): proof ${b.balanceProof?.name} for ${peso(balanceOf(b))}. Balance becomes 0, status Confirmed and an official receipt is issued.`,
                                        confirmLabel: "Approve payment",
                                        run: () => dispatch({ type: "PAY_BALANCE", id: b.id, method: "online", by: actor }),
                                      })
                                    }
                                  >
                                    <Check size={16} /> Approve
                                  </Button>
                                  <Button
                                    variant="danger"
                                    onClick={() =>
                                      ask({
                                        title: "Reject balance proof?",
                                        danger: true,
                                        body: `The guest of ${b.id} will be asked to upload a new proof.`,
                                        confirmLabel: "Reject proof",
                                        run: () => dispatch({ type: "BALANCE_PROOF_REJECT", id: b.id, by: actor }),
                                      })
                                    }
                                  >
                                    <X size={16} /> Reject
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <Note tone="neutral">
                            Waiting for the online guest to scan the QR and upload proof in <b>Payments and Refunds</b>. If the guest turns up instead, switch to "Counter".
                          </Note>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
      {paidUp.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 font-extrabold">Recently settled (official receipt)</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {paidUp.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-xl border p-3 text-sm">
                <span>
                  <b>{b.id}</b> · {b.guestName} <Badge tone="success">Paid in full</Badge>
                </span>
                <Button variant="secondary" className="min-h-9 px-3" onClick={() => setReceipt(b)}>
                  <Receipt size={15} /> Receipt
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Modal open={!!receipt} title="Receipt" onClose={() => setReceipt(null)}>
        {receipt && <ReceiptView b={receipt} cottageName={state.cottages.find((c) => c.id === receipt.cottageId)?.name} />}
      </Modal>
      {dialog}
    </div>
  )
}

type CancelResult = { id: string; guest: string; eligible: boolean; amount: number; walkIn: boolean }

function CancelTab({ preselect }: { preselect: string | null }) {
  const { state, dispatch, currentUser } = useTampisaw()
  const actor = currentUser?.name ?? "Receptionist"
  const cash = canHandleCash(currentUser?.role)
  const [selected, setSelected] = useState<string | null>(preselect)
  const [q, setQ] = useState("")
  const [result, setResult] = useState<CancelResult | null>(null)
  const requested = state.bookings.filter((b) => b.status === "cancellation-requested")
  const cancellable = state.bookings.filter((b) => ["pending", "reserved", "confirmed", "cancellation-requested"].includes(b.status))
  const found = q.trim() ? cancellable.filter((b) => matchesGuest(q, { id: b.id, name: b.guestName, email: b.email, phone: b.phone })).slice(0, 6) : []
  const booking = state.bookings.find((b) => b.id === selected && cancellable.some((x) => x.id === b.id))
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="grid content-start gap-6">
          <Card className="p-5">
            <h2 className="text-lg font-extrabold">Cancellation requested</h2>
            <p className="mb-4 text-sm text-slate-500">Online guests who asked to cancel in My Bookings.</p>
            {requested.length === 0 ? (
              <Empty>No online cancellation requests.</Empty>
            ) : (
              <div className="grid gap-2">
                {requested.map((b) => (
                  <div key={b.id}>
                    <BookingPick b={b} active={selected === b.id} onPick={() => { setSelected(b.id); setResult(null) }} />
                    {b.cancelReason && <p className="mt-1 px-2 text-xs text-slate-500">Reason: {b.cancelReason}</p>}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="text-lg font-extrabold">Walk-in guest asks to cancel</h2>
            <p className="mb-3 text-sm text-slate-500">Look up any booking by code, name, email or mobile.</p>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, email or mobile (or booking code)"
                className="min-h-12 w-full rounded-xl border border-slate-300 pl-9 pr-3 outline-none focus:border-aqua-500 focus:ring-4 focus:ring-aqua-100"
              />
            </div>
            <div className="mt-3 grid gap-2">
              {found.map((b) => (
                <BookingPick key={b.id} b={b} active={selected === b.id} onPick={() => { setSelected(b.id); setResult(null) }} />
              ))}
              {q.trim() && found.length === 0 && <Empty>No active booking matches.</Empty>}
            </div>
          </Card>
        </div>

        <div>
          {result ? (
            <Card className="p-6">
              <div className="mb-3 flex items-center gap-2 text-success-700">
                <CheckCircle2 />
                <h2 className="text-lg font-extrabold">{result.id} cancelled</h2>
              </div>
              <ul className="grid gap-2 text-sm leading-6 text-slate-700">
                <li>Status = <b>Cancelled</b>. Slot / cottage released and available to others.</li>
                <li>
                  {result.eligible ? "Refund" : "Deposit kept"} of <b>{peso(result.amount)}</b> - available in 3-5 business working days.
                </li>
                <li>{result.walkIn ? `Walk-in guest told at the counter; recorded in the walk-in guest record for ${result.guest}.` : `Online guest ${result.guest} notified in the Guest app.`}</li>
                <li>Admin can review this in the refunds & deposits ledger (Reports).</li>
              </ul>
              <Button className="mt-4" variant="secondary" onClick={() => { setResult(null); setSelected(null) }}>
                Handle another cancellation
              </Button>
            </Card>
          ) : booking && !cash ? (
            <Card className="p-6 text-sm text-slate-500">Cash handling is limited to front desk and cashier.</Card>
          ) : booking ? (
            <CancelDecision
              key={booking.id}
              booking={booking}
              onDone={(r) => {
                dispatch({ type: "PROCESS_CANCEL", id: booking.id, by: actor, eligible: r.eligible, amount: r.amount, reason: r.reason })
                setResult({ id: booking.id, guest: booking.guestName, eligible: r.eligible, amount: r.amount, walkIn: booking.source === "walk-in" })
              }}
            />
          ) : (
            <Card className="grid min-h-64 place-items-center p-8 text-center text-slate-500">
              <div>
                <ShieldAlert className="mx-auto mb-3 text-slate-300" size={40} />
                Select a cancellation request or look up a booking to decide on refund or deposit.
              </div>
            </Card>
          )}
        </div>
      </div>
      <Ledger />
    </div>
  )
}

function BookingPick({ b, active, onPick }: { b: Booking; active: boolean; onPick: () => void }) {
  return (
    <button onClick={onPick} className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${active ? "border-aqua-500 bg-aqua-50" : "border-slate-200 hover:bg-slate-50"}`}>
      <span>
        <span className="block text-sm font-extrabold">
          {b.id} · {b.guestName}
        </span>
        <span className="block text-xs text-slate-500">
          {serviceLabel(b)} · {prettyDate(b.date)} · paid {peso(b.paid)}
        </span>
      </span>
      <StatusBadge status={b.status} />
    </button>
  )
}

function CancelDecision({ booking, onDone }: { booking: Booking; onDone: (r: { eligible: boolean; amount: number; reason: string }) => void }) {
  const { state } = useTampisaw()
  const eligible = isWithinCutoff(booking, state.settings)
  const hrs = hoursUntil(booking)
  const [amount, setAmount] = useState(String(booking.paid))
  const [reason, setReason] = useState("")
  const [confirming, setConfirming] = useState(false)
  const amt = Math.max(0, Math.min(Number(amount) || 0, booking.paid))
  const finalReason = reason || (eligible ? "Cancelled 48h+ before slot" : "Late cancellation / same-day")
  const isDown = booking.dueNow !== undefined && booking.dueNow < booking.total
  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">
            {booking.id} · {booking.guestName}
          </h2>
          <p className="text-sm text-slate-500">
            {serviceLabel(booking)} · {prettyDate(booking.date)} · {slotLabels[booking.slotId] ?? booking.slotId} · {booking.source === "walk-in" ? "Walk-in" : "Online"}
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Guest's reason for cancelling</p>
        <p className="mt-1 text-slate-700">{booking.cancelReason ? booking.cancelReason : <span className="text-slate-400">No reason given.</span>}</p>
      </div>
      <Question>At least {state.settings.cancellationHours} hours before the slot (booked in advance)?</Question>
      <Note tone={eligible ? "success" : "warning"}>
        Slot starts in <b>{hrs > 0 ? `${hrs.toFixed(1)} hours` : "less than 0 hours (already started / same-day)"}</b> - answer: <b>{eligible ? "YES" : "NO"}</b>.{" "}
        {eligible ? (
          <>Eligible: enter the refund ({isDown ? `${state.settings.downpaymentPct}% downpayment` : "full payment"}) returned to the guest account within 3-5 business working days.</>
        ) : (
          <>Late request (less than {state.settings.cancellationHours} hours) or same-day booking: enter the deposit kept (available in 3-5 business working days).</>
        )}
      </Note>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input label={eligible ? "Refund amount (PHP)" : "Deposit kept (PHP)"} type="number" min={0} max={booking.paid} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Note (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={eligible ? "Cancelled 48h+ before slot" : "Late / same-day request"} />
      </div>
      <p className="mt-2 text-xs text-slate-500">Paid so far {peso(booking.paid)}. Default is the amount paid.</p>
      <Button variant={eligible ? "primary" : "danger"} className="mt-5 w-full sm:w-auto" onClick={() => setConfirming(true)}>
        <ArrowRight size={16} /> {eligible ? `Cancel & enter refund ${peso(amt)}` : `Cancel & keep deposit ${peso(amt)}`}
      </Button>
      <p className="mt-3 text-xs text-slate-500">Next: slot or cottage is released, status = Cancelled, guest is notified (walk-in guests are told at the counter).</p>
      <ConfirmDialog
        open={confirming}
        danger
        title={`Cancel booking ${booking.id}?`}
        confirmLabel={eligible ? `Cancel & refund ${peso(amt)}` : `Cancel & keep ${peso(amt)}`}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          onDone({ eligible, amount: amt, reason: finalReason })
        }}
      >
        This cancels {booking.guestName}&apos;s booking, releases the slot or cottage and cannot be undone. {eligible ? "Refund" : "Deposit kept"}: <b>{peso(amt)}</b>.
      </ConfirmDialog>
    </Card>
  )
}

function Ledger() {
  const { state } = useTampisaw()
  const refunded = state.refunds.filter((r) => r.kind === "refund").reduce((s, r) => s + r.amount, 0)
  const kept = state.refunds.filter((r) => r.kind === "deposit-kept").reduce((s, r) => s + r.amount, 0)
  return (
    <Card className="overflow-hidden">
      <div className="p-5">
        <h2 className="text-lg font-extrabold">Refunds & deposits ledger</h2>
        <p className="text-sm text-slate-500">
          Refunded {peso(refunded)} · Deposits kept {peso(kept)} · reviewed by Admin in Reports
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>When</th>
              <th className={th}>Booking</th>
              <th className={th}>Contact</th>
              <th className={th}>Paid by</th>
              <th className={th}>Type</th>
              <th className={th}>Amount</th>
              <th className={th}>Reason</th>
              <th className={th}>By</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {state.refunds.map((r) => {
              const linked = state.bookings.find((x) => x.id === r.bookingId)
              return (
              <tr key={r.id}>
                <td className={td}>{prettyDateTime(r.at)}</td>
                <td className={td}>
                  <b>{r.bookingId}</b>
                  <p className="text-xs text-slate-500">{r.guestName}</p>
                </td>
                <td className={td}>{linked?.phone || "—"}</td>
                <td className={td}>{linked ? paymentMethodLabel(linked) : "—"}</td>
                <td className={td}>
                  <Badge tone={r.kind === "refund" ? "success" : "warning"}>{r.kind === "refund" ? "Refund" : "Deposit kept"}</Badge>
                </td>
                <td className={`${td} font-bold`}>{peso(r.amount)}</td>
                <td className={td}>{r.reason}</td>
                <td className={td}>{r.by}</td>
              </tr>
              )
            })}
            {state.refunds.length === 0 && (
              <tr>
                <td className={td} colSpan={8}>
                  <Empty>No refunds or deposits recorded yet.</Empty>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* BRACELET CONTROL  (flowchart page 7)                                */
/* ------------------------------------------------------------------ */

type BraceTab = "issue" | "spot" | "lost" | "out"

export function BraceletsPage() {
  const { state } = useTampisaw()
  const [tab, setTab] = useState<BraceTab>("issue")
  const checkedIn = state.bookings.filter((b) => b.status === "checked-in")
  const missing = checkedIn.filter((b) => (b.bracelets ?? []).filter((x) => !x.voided).length < b.guests).length
  return (
    <StaffLayout>
      <PageTitle
        eyebrow="Receptionist · Bracelet control"
        title="Bracelets & time out"
        description="Tamper-evident bracelets with a unique serial, colour-coded by service. Issue at check-in, spot check at the entrance, replace if lost or damaged, and close the serials at time out."
      />
      <Tabs
        label="Which bracelet process?"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "issue", label: "Issue", badge: missing },
          { id: "spot", label: "Spot check" },
          { id: "lost", label: "Lost or damaged" },
          { id: "out", label: "Time out" },
        ]}
      />
      {tab === "issue" && <IssueTab />}
      {tab === "spot" && <SpotTab goLost={() => setTab("lost")} />}
      {tab === "lost" && <LostTab />}
      {tab === "out" && <TimeOutTab />}
      <BraceletLog />
    </StaffLayout>
  )
}

function IssueTab() {
  const { state, dispatch, currentUser } = useTampisaw()
  const actor = currentUser?.name ?? "Receptionist"
  const { ask, dialog } = useConfirm()
  const checkedIn = state.bookings.filter((b) => b.status === "checked-in")
  return (
    <div className="mb-6 grid gap-4">
      <Note tone="info">
        <b>Guest claims bracelets at the counter.</b> The bracelet is personal, cannot be passed on, and must stay on during the entire visit. Time in is recorded when bracelets are issued.
      </Note>
      {checkedIn.length === 0 && <Empty>No checked-in bookings yet. Check guests in first (QR verification or walk-in entry).</Empty>}
      {checkedIn.map((b) => {
        const active = (b.bracelets ?? []).filter((x) => !x.voided)
        const need = Math.max(0, b.guests - active.length)
        return (
          <Card key={b.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-extrabold">
                  {b.id} · {b.guestName}
                </p>
                <p className="text-sm text-slate-500">
                  {serviceLabel(b)} · {b.guests} guests · colour <b>{braceletColor(b.type, b.slotId)}</b>
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <Clock size={13} /> Time in: {b.timeIn ? prettyDateTime(b.timeIn) : b.checkedInAt ? `checked in ${b.checkedInAt}` : "not recorded"}
                </p>
              </div>
              <div className="text-right">
                <Question>Bracelets issued = guests in booking?</Question>
                <Badge tone={need === 0 ? "success" : "warning"}>
                  {active.length} of {b.guests} issued
                </Badge>
              </div>
            </div>
            {active.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {active.map((x) => (
                  <span key={x.serial} className="inline-flex items-center gap-1.5 rounded-full border bg-slate-50 px-3 py-1 font-mono text-xs font-bold">
                    <Watch size={12} /> {x.serial} · {x.color}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4">
              {need > 0 ? (
                <Button
                  onClick={() =>
                    ask({
                      title: `Issue ${need} bracelet${need > 1 ? "s" : ""}?`,
                      body: `${b.id} (${b.guestName}): ${need} bracelet${need > 1 ? "s" : ""}, colour ${braceletColor(b.type, b.slotId)}. Time in is recorded now and the bracelet is personal and cannot be passed on.`,
                      confirmLabel: "Issue bracelets",
                      run: () => dispatch({ type: "ISSUE_BRACELETS", id: b.id, by: actor }),
                    })
                  }
                >
                  <Watch size={16} /> No - issue {need} missing bracelet{need > 1 ? "s" : ""}
                </Button>
              ) : (
                <p className="text-sm font-bold text-success-700">Yes - all bracelets issued. Time in recorded.</p>
              )}
            </div>
          </Card>
        )
      })}
      {dialog}
    </div>
  )
}

function SpotTab({ goLost }: { goLost: () => void }) {
  const { state, dispatch, currentUser } = useTampisaw()
  const actor = currentUser?.name ?? "Receptionist"
  const { ask, dialog } = useConfirm()
  const inside = state.bookings.filter((b) => b.status === "checked-in" && (b.bracelets ?? []).length > 0)
  const [bid, setBid] = useState("")
  const [serial, setSerial] = useState("")
  const [intact, setIntact] = useState<boolean | null>(null)
  const [colorOk, setColorOk] = useState<boolean | null>(null)
  const [serialOk, setSerialOk] = useState<boolean | null>(null)
  const [done, setDone] = useState<{ tone: Tone; text: string; lost?: boolean } | null>(null)
  const [confirmVoid, setConfirmVoid] = useState(false)
  const b = inside.find((x) => x.id === bid)
  const band = b?.bracelets?.find((x) => x.serial === serial)
  const expected = b ? braceletColor(b.type, b.slotId) : ""
  const reset = () => { setIntact(null); setColorOk(null); setSerialOk(null); setDone(null) }
  const finish = (result: "ok" | "wrong-service" | "transfer" | "broken", detail: string, tone: Tone, text: string, lost = false) => {
    dispatch({ type: "SPOT_CHECK", bookingId: b?.id, serial: serial || undefined, result, detail, by: actor })
    setDone({ tone, text, lost })
  }
  const confirmFinish = (title: string, confirmLabel: string, args: Parameters<typeof finish>, danger = false) =>
    ask({
      title,
      body: `${b?.id} (${b?.guestName}), bracelet ${serial}: ${args[1]}. The spot check is written to the bracelet event log under ${actor} and cannot be undone.`,
      confirmLabel,
      danger,
      run: () => finish(...args),
    })
  return (
    <Card className="mb-6 p-5">
      {dialog}
      <h2 className="text-lg font-extrabold">Spot check at the pool / cottage entrance</h2>
      <p className="mb-4 text-sm text-slate-500">Look at the guest&apos;s bracelet, then walk through the checks.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Booking" value={bid} onChange={(e) => { setBid(e.target.value); setSerial(""); reset() }}>
          <option value="">Select booking...</option>
          {inside.map((x) => (
            <option key={x.id} value={x.id}>
              {x.id} · {x.guestName}
            </option>
          ))}
        </Select>
        <Select label="Bracelet serial" value={serial} disabled={!b} onChange={(e) => { setSerial(e.target.value); reset() }}>
          <option value="">Select serial...</option>
          {b?.bracelets?.map((x) => (
            <option key={x.serial} value={x.serial}>
              {x.serial}
              {x.voided ? " (VOID)" : ""}
            </option>
          ))}
        </Select>
      </div>
      {b && band && !done && (
        <div className="mt-5 grid gap-5">
          <div>
            <Question n={1}>Band intact (not cut or tampered)?</Question>
            <YesNo value={intact} onChange={(v) => { setIntact(v); setColorOk(null); setSerialOk(null) }} />
            {intact === false && (
              <div className="mt-3 grid gap-3">
                <Note tone="warning">Damaged band: go to Lost or damaged to replace it.</Note>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => confirmFinish("Record damaged band?", "Record damaged band", ["broken", `Band not intact (${band.serial})`, "warning", "Recorded as damaged.", true])}>
                    Record & continue
                  </Button>
                </div>
              </div>
            )}
          </div>
          {intact && (
            <div>
              <Question n={2}>Colour / date code matches today&apos;s service?</Question>
              <p className="mb-2 text-xs text-slate-500">
                Expected <b>{expected}</b> · band shows <b>{band.color}</b> (issued {prettyDateTime(band.issuedAt)}) {band.color === expected ? "- match" : "- MISMATCH"}
              </p>
              <YesNo value={colorOk} onChange={(v) => { setColorOk(v); setSerialOk(null) }} />
              {colorOk === false && (
                <div className="mt-3 grid gap-3">
                  <Note tone="warning">Wrong colour or date: check the booking. Allow correction (guest pays the difference) or refuse entry.</Note>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => confirmFinish("Allow correction?", "Allow correction", ["wrong-service", `Colour ${band.color} vs expected ${expected}; correction with payment of difference`, "warning", "Correction allowed: guest pays the difference, bracelet re-issued under the right service."])}>
                      Allow correction (pay difference)
                    </Button>
                    <Button variant="danger" onClick={() => confirmFinish("Refuse entry?", "Refuse entry", ["wrong-service", `Colour ${band.color} vs expected ${expected}; entry refused`, "danger", "Entry refused. Logged in the bracelet event log."], true)}>
                      Refuse entry
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {intact && colorOk && (
            <div>
              <Question n={3}>Serial scan valid and not flagged?</Question>
              <p className="mb-2 text-xs text-slate-500">
                System: {band.voided ? `serial is VOID (${band.voidReason ?? "voided"})` : "serial active and not flagged"}.
              </p>
              <YesNo value={serialOk} onChange={setSerialOk} />
              {serialOk === false && (
                <div className="mt-3 grid gap-3">
                  <Note tone="danger">
                    <b>Suspected transfer.</b> Stop the guest, void the serial, verify with booking code / ID. Admin is notified and an incident is logged.
                  </Note>
                  <Button variant="danger" className="w-fit" onClick={() => setConfirmVoid(true)}>
                    <Siren size={16} /> Stop guest, void serial & log incident
                  </Button>
                  <ConfirmDialog
                    open={confirmVoid}
                    danger
                    title={`Void bracelet ${serial}?`}
                    confirmLabel="Void serial & log incident"
                    onCancel={() => setConfirmVoid(false)}
                    onConfirm={() => {
                      setConfirmVoid(false)
                      finish("transfer", "Serial invalid or flagged at spot check", "danger", "Serial voided, guest stopped for verification, admin notified, incident logged.")
                    }}
                  >
                    The serial is voided immediately, the guest is stopped for verification and an incident is sent to Admin.
                  </ConfirmDialog>
                </div>
              )}
              {serialOk === true && (
                <Button className="mt-3" onClick={() => confirmFinish("Allow entry?", "Allow entry", ["ok", `Bracelet ${band.serial} verified`, "success", "Allow entry. Spot check recorded."])}>
                  <Check size={16} /> Allow entry & record spot check
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      {done && (
        <div className="mt-5 grid gap-3">
          <Note tone={done.tone}>{done.text}</Note>
          <div className="flex gap-2">
            {done.lost && <Button onClick={goLost}>Go to Lost or damaged</Button>}
            <Button variant="secondary" onClick={() => { setBid(""); setSerial(""); reset() }}>
              Next guest
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function LostTab() {
  const { state, dispatch, currentUser } = useTampisaw()
  const actor = currentUser?.name ?? "Receptionist"
  const [q, setQ] = useState("")
  const [searched, setSearched] = useState("")
  const [belongs, setBelongs] = useState<boolean | null>(null)
  const [reason, setReason] = useState("Lost")
  const [done, setDone] = useState("")
  const [confirmReplace, setConfirmReplace] = useState(false)
  const term = searched.trim().toLowerCase()
  const b = term ? state.bookings.find((x) => matchesGuest(term, { id: x.id, name: x.guestName, email: x.email, phone: x.phone })) : undefined
  const prior = b ? state.braceletLog.filter((e) => e.bookingId === b.id && e.kind === "replaced").length : 0
  return (
    <Card className="mb-6 p-5">
      <h2 className="text-lg font-extrabold">Bracelet lost or damaged</h2>
      <p className="mb-4 text-sm text-slate-500">Search name, email or mobile, or enter the reservation code.</p>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => { e.preventDefault(); setSearched(q); setBelongs(null); setDone("") }}
      >
        <div className="flex-1">
          <Input label="Reservation code / name / email / mobile" placeholder={SEARCH_PLACEHOLDER} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button type="submit">
          <Search size={16} /> Find booking
        </Button>
      </form>
      {term && !b && <div className="mt-4"><Note tone="danger">Booking not found. Check the code, name or phone and try again.</Note></div>}
      {b && (
        <div className="mt-5 grid gap-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-4">
            <b>{b.id}</b> · {b.guestName} · {serviceLabel(b)} <StatusBadge status={b.status} />
          </div>
          <Question n={1}>Booking found and status Checked in?</Question>
          {b.status !== "checked-in" ? (
            <Note tone="warning">
              No. Cannot issue a bracelet: the guest must check in or pay first (status is {b.status.replace("-", " ")}).
            </Note>
          ) : done ? (
            <Note tone="success">{done}</Note>
          ) : (
            <>
              <Note tone="info">Yes. The system voids the old serial once the replacement is issued.</Note>
              <Question n={2}>Verify the guest belongs to this booking (ID or booking code).</Question>
              <YesNo value={belongs} onChange={setBelongs} yes="Verified" no="Cannot verify" />
              {belongs === false && <Note tone="danger">Do not issue. Ask for the booking code or a valid ID, or refer to Admin.</Note>}
              {belongs && (
                <>
                  <Question n={3}>More than 2 replacements for this booking?</Question>
                  {prior >= 2 ? (
                    <Note tone="danger">Yes - this would be replacement #{prior + 1}. Admin is notified and an incident is logged automatically.</Note>
                  ) : (
                    <Note tone="success">No - {prior} previous replacement{prior === 1 ? "" : "s"}. Fit a new tamper-evident bracelet with a new serial.</Note>
                  )}
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                      <option>Lost</option>
                      <option>Damaged</option>
                      <option>Cut off / tamper-evident band broken</option>
                      <option>Uncomfortable / skin irritation</option>
                    </Select>
                    <Button onClick={() => setConfirmReplace(true)}>
                      <Watch size={16} /> Void old & fit new bracelet
                    </Button>
                    <ConfirmDialog
                      open={confirmReplace}
                      danger
                      title="Void the old bracelet?"
                      confirmLabel="Void old & fit new"
                      onCancel={() => setConfirmReplace(false)}
                      onConfirm={() => {
                        setConfirmReplace(false)
                        dispatch({ type: "REPLACE_BRACELET", id: b.id, reason, by: actor })
                        setDone(`New bracelet fitted. Old serial voided; old/new serial, reason (${reason}), time and staff recorded in the event log.${prior >= 2 ? " Admin notified." : ""}`)
                      }}
                    >
                      The current serial for {b.id} ({reason.toLowerCase()}) will be voided for good and a new one issued. This is recorded in the bracelet log.
                    </ConfirmDialog>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  )
}

function TimeOutTab() {
  const { state, dispatch, currentUser } = useTampisaw()
  const actor = currentUser?.name ?? "Receptionist"
  const { ask, dialog } = useConfirm()
  const [bid, setBid] = useState("")
  const [returned, setReturned] = useState<boolean | null>(null)
  const [done, setDone] = useState("")
  const inside = state.bookings.filter((b) => b.status === "checked-in")
  const b = inside.find((x) => x.id === bid)
  return (
    <Card className="mb-6 p-5">
      <h2 className="text-lg font-extrabold">Time out - guest leaves</h2>
      <p className="mb-4 text-sm text-slate-500">Guests return their bracelet when they leave.</p>
      <Select label="Checked-in booking" value={bid} onChange={(e) => { setBid(e.target.value); setReturned(null); setDone("") }}>
        <option value="">Select booking...</option>
        {inside.map((x) => (
          <option key={x.id} value={x.id}>
            {x.id} · {x.guestName} · {x.guests} guests
          </option>
        ))}
      </Select>
      {b && !done && (
        <div className="mt-5 grid gap-4">
          <p className="text-sm text-slate-600">
            Time in: <b>{b.timeIn ? prettyDateTime(b.timeIn) : (b.checkedInAt ?? "not recorded")}</b> · Active serials: {(b.bracelets ?? []).filter((x) => !x.voided).map((x) => x.serial).join(", ") || "none issued"}
          </p>
          <Question>Bracelet returned?</Question>
          <YesNo value={returned} onChange={setReturned} />
          {returned === false && <Note tone="warning">Record as not returned (lost). Serials are still closed.</Note>}
          {returned !== null && (
            <Button
              className="w-fit"
              onClick={() =>
                ask({
                  title: "Enter time out?",
                  body: `${b.id} (${b.guestName}), ${b.guests} guests: bracelet ${returned ? "returned" : "NOT returned (recorded as lost)"}. Status becomes Checked out and serials are closed. This cannot be undone.`,
                  confirmLabel: "Enter time out",
                  danger: !returned,
                  run: () => {
                    dispatch({ type: "TIME_OUT", id: b.id, returned, by: actor })
                    setDone(`Time out entered for ${b.id}. Status = Checked out, serials closed. Time in/out saved for Forecast and visible to the guest.`)
                  },
                })
              }
            >
              <Clock size={16} /> Enter time out in booking
            </Button>
          )}
        </div>
      )}
      {done && <div className="mt-4"><Note tone="success">{done}</Note></div>}
      {dialog}
      <div className="mt-6">
        <h3 className="mb-2 text-sm font-extrabold">Recently checked out</h3>
        <div className="grid gap-2">
          {state.bookings
            .filter((x) => x.status === "checked-out")
            .slice(0, 4)
            .map((x) => (
              <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
                <span>
                  <b>{x.id}</b> · {x.guestName}
                </span>
                <span className="text-slate-500">
                  In {x.timeIn ? prettyDateTime(x.timeIn) : "-"} · Out {x.timeOut ? prettyDateTime(x.timeOut) : "-"}
                </span>
                <Badge tone={x.braceletReturned ? "success" : "danger"}>{x.braceletReturned ? "Returned" : "Not returned"}</Badge>
              </div>
            ))}
        </div>
      </div>
    </Card>
  )
}

function BraceletLog() {
  const { state } = useTampisaw()
  const tone: Record<string, Tone> = { issued: "success", "spot-check": "info", replaced: "warning", voided: "danger", "time-out": "neutral", "not-returned": "danger" }
  return (
    <Card className="overflow-hidden">
      <div className="p-5">
        <h2 className="text-lg font-extrabold">Bracelet event log</h2>
        <p className="text-sm text-slate-500">Every issue, spot check, replacement and time out with the staff member and time.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Time</th>
              <th className={th}>Booking</th>
              <th className={th}>Event</th>
              <th className={th}>Detail</th>
              <th className={th}>Staff</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {state.braceletLog.slice(0, 30).map((e) => (
              <tr key={e.id}>
                <td className={td}>{prettyDateTime(e.at)}</td>
                <td className={`${td} font-bold`}>{e.bookingId ?? "-"}</td>
                <td className={td}>
                  <Badge tone={tone[e.kind]}>{e.kind.replace("-", " ")}</Badge>
                </td>
                <td className={`${td} font-mono text-xs`}>{e.detail}</td>
                <td className={td}>{e.by}</td>
              </tr>
            ))}
            {state.braceletLog.length === 0 && (
              <tr>
                <td className={td} colSpan={5}>
                  <Empty>No bracelet events yet.</Empty>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* INCIDENTS & MAINTENANCE  (flowchart page 5)                         */
/* ------------------------------------------------------------------ */

type Item = {
  id: string
  title: string
  sub: string
  status: string
  tone: Tone
  flags: string[]
  createdAt: string
}

function FilterList({
  items,
  filters,
  selected,
  onSelect,
}: {
  items: Item[]
  filters: { id: string; label: string }[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  const [f, setF] = useState(filters[0].id)
  const shown = items.filter((i) => i.status === f)
  return (
    <Card className="p-4">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {filters.map((x) => (
          <button
            key={x.id}
            onClick={() => setF(x.id)}
            className={`rounded-lg px-3 py-2 text-xs font-extrabold ${f === x.id ? "bg-ink-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {x.label} ({items.filter((i) => i.status === x.id).length})
          </button>
        ))}
      </div>
      <div className="grid gap-2">
        {shown.length === 0 && <Empty>Nothing here.</Empty>}
        {shown.map((i) => (
          <button
            key={i.id}
            onClick={() => onSelect(i.id)}
            className={`rounded-xl border p-3 text-left transition ${selected === i.id ? "border-aqua-500 bg-aqua-50" : "border-slate-200 hover:bg-slate-50"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-extrabold">{i.id}</span>
              <span className="flex flex-wrap justify-end gap-1">
                {i.flags.map((fl) => (
                  <Badge key={fl} tone="danger">
                    {fl}
                  </Badge>
                ))}
              </span>
            </div>
            <p className="text-sm font-semibold">{i.title}</p>
            <p className="text-xs text-slate-500">
              {i.sub} · {prettyDateTime(i.createdAt)}
            </p>
          </button>
        ))}
      </div>
    </Card>
  )
}

function NotesList({ notes }: { notes: { at: string; by: string; text: string }[] }) {
  if (!notes.length) return null
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">Notes & timeline</p>
      <ol className="grid gap-2 border-l-2 border-slate-200 pl-4">
        {notes.map((n, i) => (
          <li key={i} className="text-sm">
            <p>{n.text}</p>
            <p className="text-xs text-slate-500">
              {n.by} · {prettyDateTime(n.at)}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Meta({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-bold uppercase text-slate-500">{k}</dt>
          <dd className="font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function AgeBar({ createdAt, targetH, resolvedAt }: { createdAt: string; targetH: number; resolvedAt?: string }) {
  const age = (resolvedAt ? new Date(resolvedAt).getTime() : Date.now()) - new Date(createdAt).getTime()
  const over = age > targetH * 3_600_000
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Clock size={15} className="text-slate-400" />
      <span>
        {resolvedAt ? "Time to resolve" : "Open for"} <b>{duration(age)}</b> · target {targetH}h
      </span>
      <Badge tone={over ? "danger" : "success"}>{over ? "Past target" : "Within target"}</Badge>
    </div>
  )
}

const avgMs = (xs: { createdAt: string; resolvedAt?: string }[]) => {
  const d = xs.filter((x) => x.resolvedAt).map((x) => new Date(x.resolvedAt as string).getTime() - new Date(x.createdAt).getTime())
  return d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0
}

function GuestConfirm({ value, closed }: { value?: boolean; closed: string }) {
  return value ? (
    <Badge tone="success">Guest confirmed {closed}</Badge>
  ) : (
    <Badge tone="warning">Awaiting guest confirmation (done in Guest app)</Badge>
  )
}

/* ---------- Incidents ---------- */

const incFilters = [
  { id: "requested", label: "Requested" },
  { id: "in-progress", label: "In progress" },
  { id: "resolved", label: "Resolved" },
  { id: "cancelled", label: "Cancelled" },
]
const incTone = (s: string): Tone => (s === "resolved" ? "success" : s === "cancelled" ? "neutral" : s === "in-progress" ? "info" : "warning")

function IncidentsModule({ admin }: { admin: boolean }) {
  const { state } = useTampisaw()
  const [sel, setSel] = useState<string | null>(null)
  const list = state.incidents
  const items: Item[] = list.map((i) => ({
    id: i.id,
    title: `${i.type} · ${i.location}`,
    sub: i.guestName,
    status: i.status,
    tone: incTone(i.status),
    flags: [i.serious ? "Serious" : "", i.escalated ? "Escalated" : ""].filter(Boolean),
    createdAt: i.createdAt,
  }))
  const current = list.find((i) => i.id === sel)
  const open = list.filter((i) => i.status === "requested" || i.status === "in-progress").length
  const resolved = list.filter((i) => i.status === "resolved")
  return (
    <>
      <PageTitle
        eyebrow={admin ? "Admin · Oversight" : "Receptionist · Incident handling"}
        title="Incidents"
        description={admin ? "Review every incident, its notes and resolution time. Decide on escalated and serious cases." : "Validate each report, respond to serious cases on site, and keep the guest informed until it is resolved."}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Open incidents" value={open} detail="Requested + in progress" icon={<AlertTriangle size={20} />} />
        <StatCard label="Escalated to Admin" value={list.filter((i) => i.escalated && i.status !== "resolved" && i.status !== "cancelled").length} detail="Needs admin decision" icon={<Siren size={20} />} />
        <StatCard label="Avg. time to resolve" value={resolved.length ? duration(avgMs(resolved)) : "-"} detail={`${resolved.length} resolved`} icon={<Clock size={20} />} />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[380px_1fr]">
        <FilterList items={items} filters={incFilters} selected={sel} onSelect={setSel} />
        {current ? (
          <IncidentDetail key={current.id} item={current} admin={admin} />
        ) : (
          <Card className="grid min-h-64 place-items-center p-8 text-center text-slate-500">Select an incident to see details and next steps.</Card>
        )}
      </div>
      {admin && (
        <Card className="mt-6 overflow-hidden">
          <div className="p-5">
            <h2 className="text-lg font-extrabold">Admin review: all incidents</h2>
            <p className="text-sm text-slate-500">Resolution times and notes across every report.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Ref</th>
                  <th className={th}>Type / location</th>
                  <th className={th}>Guest</th>
                  <th className={th}>Status</th>
                  <th className={th}>Time to resolve</th>
                  <th className={th}>Guest confirmed</th>
                  <th className={th}>Last note</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.map((i) => (
                  <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSel(i.id)}>
                    <td className={`${td} font-bold`}>{i.id}</td>
                    <td className={td}>
                      {i.type}
                      <p className="text-xs text-slate-500">{i.location}</p>
                    </td>
                    <td className={td}>{i.guestName}</td>
                    <td className={td}>
                      <Badge tone={incTone(i.status)}>{i.status.replace("-", " ")}</Badge> {i.escalated && <Badge tone="danger">Escalated</Badge>}
                    </td>
                    <td className={td}>{i.resolvedAt ? duration(new Date(i.resolvedAt).getTime() - new Date(i.createdAt).getTime()) : "-"}</td>
                    <td className={td}>{i.status === "resolved" ? (i.guestConfirmed ? "Yes" : "Pending") : "-"}</td>
                    <td className={`${td} max-w-xs truncate text-slate-600`}>{i.adminReview ? `Admin: ${i.adminReview}` : (i.notes[i.notes.length - 1]?.text ?? "-")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}

function IncidentDetail({ item, admin }: { item: Incident; admin: boolean }) {
  const { dispatch, currentUser } = useTampisaw()
  const actor = currentUser?.name ?? (admin ? "Admin" : "Receptionist")
  const [valid, setValid] = useState<boolean | null>(null)
  const [serious, setSerious] = useState<boolean | null>(null)
  const [reason, setReason] = useState("")
  const [actionNote, setActionNote] = useState("")
  const [resolved, setResolved] = useState<boolean | null>(null)
  const [followUp, setFollowUp] = useState("")
  const [resolution, setResolution] = useState("")
  const [adminNote, setAdminNote] = useState(item.adminReview ?? "")
  const [confirmCancel, setConfirmCancel] = useState(false)
  const { ask, dialog } = useConfirm()
  const upNow = (patch: Partial<Incident>, note?: string, notify?: string) => dispatch({ type: "UPDATE_INCIDENT", id: item.id, patch, note, by: actor, notify })
  const up = (patch: Partial<Incident>, note?: string, notify?: string) =>
    ask({
      title: `Update incident ${item.id}?`,
      body: `${item.id}: ${note ?? "status update"}.${patch.status ? ` Status becomes ${patch.status}.` : ""}${notify ? " The guest is notified." : ""} This is added to the audit trail and cannot be undone.`,
      confirmLabel: "Save update",
      danger: patch.status === "cancelled",
      run: () => upNow(patch, note, notify),
    })
  const TARGET = 2
  return (
    <Card className="p-6">
      {dialog}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Ref {item.id}</p>
          <h2 className="text-xl font-extrabold">{item.type}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={incTone(item.status)}>{item.status.replace("-", " ")}</Badge>
          {item.serious && <Badge tone="danger">Serious</Badge>}
          {item.escalated && <Badge tone="danger">Escalated to Admin</Badge>}
        </div>
      </div>
      <Meta
        rows={[
          ["Guest", item.guestName],
          ["Linked booking", item.bookingId ?? "None"],
          ["Location", item.location],
          ["Reported", `${prettyDateTime(item.createdAt)} (${item.source})`],
        ]}
      />
      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6">{item.description}</p>
      {item.status !== "cancelled" && <div className="mt-3"><AgeBar createdAt={item.createdAt} targetH={TARGET} resolvedAt={item.resolvedAt} /></div>}
      <NotesList notes={item.notes} />

      <div className="mt-5 grid gap-4 border-t pt-5">
        {item.status === "requested" && (
          <>
            <Question n={1}>Valid report, not a duplicate?</Question>
            <YesNo value={valid} onChange={setValid} />
            {valid === false && (
              <div className="grid gap-3">
                <TextArea label="Reason (sent to the guest)" value={reason} onChange={setReason} placeholder="e.g. Duplicate of INC-1002" />
                <Button variant="danger" className="w-fit" disabled={!reason.trim()} onClick={() => setConfirmCancel(true)}>
                  Cancel report & notify guest
                </Button>
                <ConfirmDialog
                  open={confirmCancel}
                  danger
                  title={`Cancel incident ${item.id}?`}
                  confirmLabel="Cancel report"
                  onCancel={() => setConfirmCancel(false)}
                  onConfirm={() => {
                    setConfirmCancel(false)
                    upNow({ status: "cancelled" }, `Cancelled: ${reason}`, `Your report was closed (cancelled): ${reason}`)
                  }}
                >
                  The report is closed as invalid or duplicate and the guest is notified with your reason: &ldquo;{reason}&rdquo;.
                </ConfirmDialog>
              </div>
            )}
            {valid && (
              <>
                <Question n={2}>Serious (injury or safety risk)?</Question>
                <YesNo value={serious} onChange={setSerious} />
                {serious && (
                  <div className="grid gap-3">
                    <Note tone="danger">
                      <b>Respond on site immediately and escalate to Admin.</b> Admin reviews, decides the action (emergency help, close off the area) and adds notes.
                    </Note>
                    <Button variant="danger" className="w-fit" onClick={() => up({ serious: true, escalated: true, status: "in-progress" }, "Serious: staff responding on site; escalated to Admin", "Staff are responding on site right now. Status: In progress.")}>
                      <Siren size={16} /> Responding on site - escalate to Admin
                    </Button>
                  </div>
                )}
                {serious === false && (
                  <div className="grid gap-3">
                    <TextArea label="Action notes" value={actionNote} onChange={setActionNote} placeholder="What will staff do?" />
                    <Button className="w-fit" disabled={!actionNote.trim()} onClick={() => up({ status: "in-progress", serious: false }, `Action: ${actionNote}`, `Status changed to In progress. ${actionNote}`)}>
                      Set In progress & notify guest
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {item.status === "in-progress" && (
          <>
            <Question n={1}>Issue resolved?</Question>
            <YesNo value={resolved} onChange={setResolved} />
            {resolved === false && (
              <div className="grid gap-3">
                <Note tone="warning">Keep In progress and follow up. Escalate to Admin if past the {TARGET}h target time.</Note>
                <TextArea label="Follow-up note" value={followUp} onChange={setFollowUp} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={!followUp.trim()} onClick={() => { up({}, `Follow-up: ${followUp}`); setFollowUp("") }}>
                    Save follow-up
                  </Button>
                  {!item.escalated && (
                    <Button variant="danger" onClick={() => up({ escalated: true }, "Escalated to Admin: not resolved within target time")}>
                      <Siren size={16} /> Escalate to Admin
                    </Button>
                  )}
                </div>
              </div>
            )}
            {resolved && (
              <div className="grid gap-3">
                <TextArea label="Resolution notes" value={resolution} onChange={setResolution} />
                <Button className="w-fit" disabled={!resolution.trim()} onClick={() => up({ status: "resolved", guestConfirmed: undefined }, `Resolved: ${resolution}`, "Your incident was marked Resolved. Please confirm it is resolved in your Help & requests page.")}>
                  <CheckCircle2 size={16} /> Mark Resolved & ask guest to confirm
                </Button>
              </div>
            )}
          </>
        )}

        {item.status === "resolved" && (
          <div className="grid gap-2">
            <GuestConfirm value={item.guestConfirmed} closed="resolved" />
            <p className="text-sm text-slate-500">If the guest says it is not resolved, the status returns to In progress (done in the Guest app). The resolution time is recorded.</p>
          </div>
        )}
        {item.status === "cancelled" && <p className="text-sm text-slate-500">Report closed as invalid or duplicate. Guest was notified.</p>}

        {item.escalated && !admin && item.status !== "cancelled" && <Note tone="warning">Escalated: waiting for Admin review and decision.</Note>}
        {admin && item.status !== "cancelled" && (
          <div className="rounded-xl border border-ink-950/10 bg-sky-50/60 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-extrabold">
              <ShieldAlert size={16} /> Admin review {item.escalated ? "(escalated)" : ""}
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              {["Emergency help called", "Area closed off", "Handled - no further action"].map((a) => (
                <Button key={a} variant="secondary" className="min-h-9 px-3" onClick={() => up({ escalated: true }, `Admin decision: ${a}`)}>
                  {a}
                </Button>
              ))}
            </div>
            <TextArea label="Admin notes" rows={2} value={adminNote} onChange={setAdminNote} />
            <Button className="mt-3" disabled={!adminNote.trim()} onClick={() => up({ adminReview: adminNote }, `Admin review: ${adminNote}`)}>
              Save admin review
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

/* ---------- Maintenance ---------- */

const mntFilters = [
  { id: "requested", label: "Requested" },
  { id: "on-the-way", label: "On the way" },
  { id: "done", label: "Done" },
  { id: "cancelled", label: "Cancelled" },
]
const mntTone = (s: string): Tone => (s === "done" ? "success" : s === "cancelled" ? "neutral" : s === "on-the-way" ? "info" : "warning")

function MaintenanceModule({ admin }: { admin: boolean }) {
  const { state } = useTampisaw()
  const [sel, setSel] = useState<string | null>(null)
  const list = state.maintenance
  const items: Item[] = list.map((m) => ({
    id: m.id,
    title: `${m.concern} · ${m.area}`,
    sub: m.guestName,
    status: m.status,
    tone: mntTone(m.status),
    flags: [m.urgent ? "Urgent" : "", m.escalated ? "Escalated" : ""].filter(Boolean),
    createdAt: m.createdAt,
  }))
  const current = list.find((m) => m.id === sel)
  const done = list.filter((m) => m.status === "done")
  const byArea = useMemo(() => {
    const map = new Map<string, MaintenanceRequest[]>()
    list.filter((m) => m.status !== "cancelled").forEach((m) => map.set(m.area, [...(map.get(m.area) ?? []), m]))
    return [...map.entries()].map(([area, xs]) => {
      const concerns = new Map<string, number>()
      xs.forEach((x) => concerns.set(x.concern, (concerns.get(x.concern) ?? 0) + 1))
      const top = [...concerns.entries()].sort((a, b) => b[1] - a[1])[0]
      return { area, count: xs.length, open: xs.filter((x) => x.status !== "done").length, avg: avgMs(xs), top }
    }).sort((a, b) => b.count - a.count)
  }, [list])
  return (
    <>
      <PageTitle
        eyebrow={admin ? "Admin · Oversight" : "Receptionist · Maintenance requests"}
        title="Maintenance"
        description={admin ? "Review recurring concerns and resolution times per cottage or pool area." : "Validate requests, assign maintenance staff, keep the guest informed and close the job when the fix is done."}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Open requests" value={list.filter((m) => m.status === "requested" || m.status === "on-the-way").length} detail="Requested + on the way" icon={<Wrench size={20} />} />
        <StatCard label="Urgent open" value={list.filter((m) => m.urgent && m.status !== "done" && m.status !== "cancelled").length} detail="Call maintenance staff" icon={<Siren size={20} />} />
        <StatCard label="Avg. time to fix" value={done.length ? duration(avgMs(done)) : "-"} detail={`${done.length} done`} icon={<Clock size={20} />} />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[380px_1fr]">
        <FilterList items={items} filters={mntFilters} selected={sel} onSelect={setSel} />
        {current ? (
          <MaintenanceDetail key={current.id} item={current} admin={admin} />
        ) : (
          <Card className="grid min-h-64 place-items-center p-8 text-center text-slate-500">Select a request to see details and next steps.</Card>
        )}
      </div>
      {admin && (
        <Card className="mt-6 overflow-hidden">
          <div className="p-5">
            <h2 className="text-lg font-extrabold">Admin review: recurring concerns by area</h2>
            <p className="text-sm text-slate-500">Areas with repeated requests may need a permanent fix.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Cottage / area</th>
                  <th className={th}>Requests</th>
                  <th className={th}>Still open</th>
                  <th className={th}>Avg. resolution</th>
                  <th className={th}>Top concern</th>
                  <th className={th}>Pattern</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {byArea.map((a) => (
                  <tr key={a.area}>
                    <td className={`${td} font-bold`}>{a.area}</td>
                    <td className={td}>{a.count}</td>
                    <td className={td}>{a.open}</td>
                    <td className={td}>{a.avg ? duration(a.avg) : "-"}</td>
                    <td className={td}>
                      {a.top[0]} ({a.top[1]}x)
                    </td>
                    <td className={td}>{a.top[1] >= 2 ? <Badge tone="danger">Recurring</Badge> : <Badge>One-off</Badge>}</td>
                  </tr>
                ))}
                {byArea.length === 0 && (
                  <tr>
                    <td className={td} colSpan={6}>
                      <Empty>No requests yet.</Empty>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}

function MaintenanceDetail({ item, admin }: { item: MaintenanceRequest; admin: boolean }) {
  const { dispatch, currentUser } = useTampisaw()
  const actor = currentUser?.name ?? (admin ? "Admin" : "Receptionist")
  const [valid, setValid] = useState<boolean | null>(null)
  const [urgent, setUrgent] = useState<boolean | null>(item.urgent ? true : null)
  const [reason, setReason] = useState("")
  const [staff, setStaff] = useState(item.assignedTo ?? "")
  const [fixed, setFixed] = useState<boolean | null>(null)
  const [issue, setIssue] = useState("")
  const [notes, setNotes] = useState("")
  const [adminNote, setAdminNote] = useState(item.adminReview ?? "")
  const [confirmCancel, setConfirmCancel] = useState(false)
  const { ask, dialog } = useConfirm()
  const upNow = (patch: Partial<MaintenanceRequest>, note?: string, notify?: string) => dispatch({ type: "UPDATE_MAINT", id: item.id, patch, note, by: actor, notify })
  const up = (patch: Partial<MaintenanceRequest>, note?: string, notify?: string) =>
    ask({
      title: `Update maintenance request ${item.id}?`,
      body: `${item.id}: ${note ?? "status update"}.${patch.status ? ` Status becomes ${patch.status}.` : ""}${notify ? " The guest is notified." : ""} This is added to the audit trail and cannot be undone.`,
      confirmLabel: "Save update",
      danger: patch.status === "cancelled",
      run: () => upNow(patch, note, notify),
    })
  const TARGET = item.urgent ? 1 : 3
  return (
    <Card className="p-6">
      {dialog}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Ref {item.id}</p>
          <h2 className="text-xl font-extrabold">{item.concern}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={mntTone(item.status)}>{item.status.replace(/-/g, " ")}</Badge>
          {item.urgent && <Badge tone="danger">Urgent</Badge>}
          {item.escalated && <Badge tone="danger">Escalated to Admin</Badge>}
        </div>
      </div>
      <Meta
        rows={[
          ["Guest", item.guestName],
          ["Linked booking", item.bookingId ?? "None"],
          ["Area", item.area],
          ["Assigned to", item.assignedTo ?? "Unassigned"],
          ["Reported", prettyDateTime(item.createdAt)],
        ]}
      />
      {item.details && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6">{item.details}</p>}
      {item.status !== "cancelled" && <div className="mt-3"><AgeBar createdAt={item.createdAt} targetH={TARGET} resolvedAt={item.resolvedAt} /></div>}
      <NotesList notes={item.notes} />

      <div className="mt-5 grid gap-4 border-t pt-5">
        {item.status === "requested" && (
          <>
            <Question n={1}>Valid request, not a duplicate?</Question>
            <YesNo value={valid} onChange={setValid} />
            {valid === false && (
              <div className="grid gap-3">
                <TextArea label="Reason (sent to the guest)" value={reason} onChange={setReason} />
                <Button variant="danger" className="w-fit" disabled={!reason.trim()} onClick={() => setConfirmCancel(true)}>
                  Cancel request & notify guest
                </Button>
                <ConfirmDialog
                  open={confirmCancel}
                  danger
                  title={`Cancel maintenance request ${item.id}?`}
                  confirmLabel="Cancel request"
                  onCancel={() => setConfirmCancel(false)}
                  onConfirm={() => {
                    setConfirmCancel(false)
                    upNow({ status: "cancelled" }, `Cancelled: ${reason}`, `Your maintenance request was closed (cancelled): ${reason}`)
                  }}
                >
                  The request is closed as invalid or duplicate and the guest is notified with your reason: &ldquo;{reason}&rdquo;.
                </ConfirmDialog>
              </div>
            )}
            {valid && (
              <>
                <Question n={2}>Urgent?</Question>
                <YesNo value={urgent} onChange={setUrgent} />
                {urgent && <Note tone="danger"><b>Call maintenance staff immediately.</b> Then assign them below.</Note>}
                {urgent !== null && (
                  <div className="grid gap-3">
                    <Input label="Assign maintenance staff" value={staff} onChange={(e) => setStaff(e.target.value)} placeholder="e.g. Mang Rudy" />
                    <Button className="w-fit" disabled={!staff.trim()} onClick={() => up({ assignedTo: staff.trim(), urgent: !!urgent, status: "on-the-way" }, `Assigned to ${staff.trim()}${urgent ? " (urgent)" : ""}`, `Maintenance staff (${staff.trim()}) is on the way.`)}>
                      <Wrench size={16} /> Assign & set On the way
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {item.status === "on-the-way" && (
          <>
            <Question n={1}>Fix completed?</Question>
            <YesNo value={fixed} onChange={setFixed} />
            {fixed === false && (
              <div className="grid gap-3">
                <Note tone="warning">Record the issue, escalate to Admin if unresolved, and message the guest.</Note>
                <TextArea label="Issue found / what is left" value={issue} onChange={setIssue} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={!issue.trim()} onClick={() => { up({}, `Not yet fixed: ${issue}`, `Update: the fix is not complete yet (${issue}). We are following up.`); setIssue("") }}>
                    Record issue & message guest
                  </Button>
                  {!item.escalated && (
                    <Button variant="danger" onClick={() => up({ escalated: true }, "Escalated to Admin: fix unresolved")}>
                      <Siren size={16} /> Escalate to Admin
                    </Button>
                  )}
                </div>
              </div>
            )}
            {fixed && (
              <div className="grid gap-3">
                <TextArea label="Completion notes" value={notes} onChange={setNotes} />
                <Button className="w-fit" disabled={!notes.trim()} onClick={() => up({ status: "done", guestConfirmed: undefined }, `Done: ${notes}`, "Your maintenance request is marked Done. Please confirm it was fixed.")}>
                  <CheckCircle2 size={16} /> Mark Done & ask guest to confirm
                </Button>
              </div>
            )}
          </>
        )}

        {item.status === "done" && (
          <div className="grid gap-2">
            <GuestConfirm value={item.guestConfirmed} closed="fixed" />
            <p className="text-sm text-slate-500">Resolution time recorded. If the guest says it is not fixed, the request returns to On the way (done in the Guest app).</p>
          </div>
        )}
        {item.status === "cancelled" && <p className="text-sm text-slate-500">Request closed as invalid or duplicate. Guest was notified.</p>}

        {item.escalated && !admin && item.status !== "cancelled" && <Note tone="warning">Escalated: waiting for Admin review.</Note>}
        {admin && item.status !== "cancelled" && (
          <div className="rounded-xl border border-ink-950/10 bg-sky-50/60 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-extrabold">
              <ShieldAlert size={16} /> Admin review {item.escalated ? "(escalated)" : ""}
            </p>
            <TextArea label="Admin notes" rows={2} value={adminNote} onChange={setAdminNote} />
            <Button className="mt-3" disabled={!adminNote.trim()} onClick={() => up({ adminReview: adminNote, escalated: item.escalated }, `Admin review: ${adminNote}`)}>
              Save admin review
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* exported pages                                                      */
/* ------------------------------------------------------------------ */

export function IncidentsPage() {
  return (
    <StaffLayout>
      <IncidentsModule admin={false} />
    </StaffLayout>
  )
}

export function MaintenancePage() {
  return (
    <StaffLayout>
      <MaintenanceModule admin={false} />
    </StaffLayout>
  )
}

export function AdminIncidentsPage() {
  return (
    <AdminLayout>
      <IncidentsModule admin />
    </AdminLayout>
  )
}

export function AdminMaintenancePage() {
  return (
    <AdminLayout>
      <MaintenanceModule admin />
    </AdminLayout>
  )
}
