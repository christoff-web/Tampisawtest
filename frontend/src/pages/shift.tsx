import { Banknote, ClipboardCheck } from "lucide-react"
import { useMemo, useState } from "react"
import { AdminLayout, StaffLayout } from "../components/layouts"
import { useLeaveGuard } from "../components/leave-guard"
import { Button, Card, Input, PageTitle, Textarea } from "../components/ui"
import { peso, prettyDateTime } from "../lib/rules"
import { useTampisaw } from "../store"
import type { ShiftReport } from "../types"

const NOTES = [1000, 500, 200, 100, 50, 20] as const
const LEAVE_COPY = "Your cash count and handover note have not been saved."

const sameDay = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-ink-900">{value}</p>
    </div>
  )
}
const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0))

function varianceTone(v: number) {
  if (v === 0) return { label: "Balanced", cls: "border-success-300 bg-success-50 text-success-900" }
  if (Math.abs(v) <= 50) return { label: v > 0 ? "Slightly over" : "Slightly short", cls: "border-warning-300 bg-warning-50 text-warning-900" }
  return { label: v > 0 ? "Over" : "Short", cls: "border-danger-300 bg-danger-50 text-danger-900" }
}

function ReportList({ reports, showBy }: { reports: ShiftReport[]; showBy?: boolean }) {
  if (reports.length === 0) return <p className="text-sm text-slate-500">No shift reports yet.</p>
  return (
    <ul className="space-y-3">
      {reports.map((r) => {
        const t = varianceTone(r.variance)
        return (
          <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-extrabold text-ink-900">
                {prettyDateTime(r.closedAt)}
                {showBy && ` · ${r.by}`}
              </p>
              <span className={`rounded-full border px-3 py-1 text-xs font-extrabold ${t.cls}`}>
                {t.label}: {peso(r.variance)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Float {peso(r.openingFloat)} · Expected {peso(r.expectedCash)} · Counted {peso(r.countedCash)}
            </p>
            <p className="mt-2 text-sm text-slate-700">{r.note}</p>
          </li>
        )
      })}
    </ul>
  )
}

export function ShiftPage() {
  const { state, dispatch, currentUser } = useTampisaw()
  const name = currentUser?.name ?? "Receptionist"
  const [float, setFloat] = useState("")
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [done, setDone] = useState("")

  const dirty = !!(float || note.trim() || Object.values(counts).some((v) => v))
  const { dialog } = useLeaveGuard(dirty, LEAVE_COPY)

  // Cash collected today by this staff member, read from the audit trail.
  const { collected, refunded } = useMemo(() => {
    let collected = 0
    for (const e of state.auditLog) {
      if (e.actor !== name || !sameDay(e.at)) continue
      const m = /^Recorded (.+?) (cash|counter) payment/.exec(e.action)
      if (m) collected += Number(m[1].replace(/[^0-9.]/g, "")) || 0
    }
    const refunded = state.refunds
      .filter((r) => r.kind === "refund" && r.by === name && sameDay(r.at))
      .reduce((sum, r) => sum + r.amount, 0)
    return { collected, refunded }
  }, [state.auditLog, state.refunds, name])

  const openingFloat = num(float)
  const expected = openingFloat + collected - refunded
  const counted = NOTES.reduce((sum, d) => sum + d * num(counts[d] ?? ""), 0) + num(counts.coins ?? "")
  const variance = counted - expected
  const tone = varianceTone(variance)
  const mine = state.shiftReports.filter((r) => r.by === name)

  const close = () => {
    if (!note.trim()) {
      setError("Add a handover note before closing your shift.")
      return
    }
    setError("")
    const denominations: Record<string, number> = {}
    for (const [k, v] of Object.entries(counts)) if (num(v)) denominations[k] = num(v)
    dispatch({
      type: "SAVE_SHIFT",
      report: {
        id: `SH-${Date.now()}`,
        closedAt: new Date().toISOString(),
        by: name,
        openingFloat,
        expectedCash: expected,
        countedCash: counted,
        variance,
        denominations,
        note: note.trim(),
      },
    })
    setFloat("")
    setCounts({})
    setNote("")
    setDone(`Shift closed. Counted ${peso(counted)}, variance ${peso(variance)}.`)
  }

  return (
    <StaffLayout>
      {dialog}
      <PageTitle eyebrow="Money" title="End of shift" description="Reconcile your cash drawer, leave a handover note and close your shift." />
      {done && (
        <p role="status" className="mb-5 rounded-xl border border-success-300 bg-success-50 p-3 text-sm font-bold text-success-900">
          {done}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="flex items-center gap-2 font-extrabold text-ink-900">
              <Banknote size={18} className="text-aqua-700" /> Expected cash
            </h2>
            <Input label="Opening float (₱)" type="number" min={0} inputMode="numeric" value={float} onChange={(e) => setFloat(e.target.value)} placeholder="0" />
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Cash collected today" value={peso(collected)} />
              <StatCard label="Cash refunds paid" value={peso(refunded)} />
              <StatCard label="Expected in drawer" value={peso(expected)} />
            </div>
            <p className="text-xs text-slate-500">Based on cash payments you recorded and refunds you entered today. GCash payments are not included.</p>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="font-extrabold text-ink-900">Counted cash</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {NOTES.map((d) => (
                <Input
                  key={d}
                  label={`₱${d} bills (count)`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={counts[d] ?? ""}
                  onChange={(e) => setCounts((c) => ({ ...c, [d]: e.target.value }))}
                  hint={num(counts[d] ?? "") ? peso(d * num(counts[d] ?? "")) : undefined}
                />
              ))}
              <Input
                label="Coins (total ₱)"
                type="number"
                min={0}
                inputMode="numeric"
                value={counts.coins ?? ""}
                onChange={(e) => setCounts((c) => ({ ...c, coins: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-sand-50 p-4">
              <span className="text-sm font-bold text-ink-800">Counted total</span>
              <span className="text-2xl font-extrabold text-ink-900">{peso(counted)}</span>
            </div>
            <div role="status" className={`rounded-xl border-2 p-4 ${tone.cls}`}>
              <p className="text-xs font-extrabold uppercase tracking-wide">Variance</p>
              <p className="text-3xl font-extrabold">{peso(variance)}</p>
              <p className="text-sm font-bold">{tone.label}</p>
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <Textarea
              label="Handover note (required)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Anything the next shift should know, and the reason for any variance."
              error={error || undefined}
            />
            <Button className="w-full" onClick={close}>
              <ClipboardCheck size={18} /> Close shift
            </Button>
          </Card>
        </div>

        <Card className="h-fit p-5">
          <h2 className="mb-3 font-extrabold text-ink-900">Your past shifts</h2>
          <ReportList reports={mine} />
        </Card>
      </div>
    </StaffLayout>
  )
}

export function AdminShiftsPage() {
  const { state } = useTampisaw()
  const total = state.shiftReports.reduce((s, r) => s + r.variance, 0)
  const flagged = state.shiftReports.filter((r) => Math.abs(r.variance) > 50).length
  return (
    <AdminLayout>
      <PageTitle eyebrow="Money" title="Shift reports" description="Cash reconciliation and handover notes from every closed shift." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Reports" value={String(state.shiftReports.length)} />
        <StatCard label="Net variance" value={peso(total)} />
        <StatCard label="Large variances" value={String(flagged)} />
      </div>
      <Card className="p-5">
        <ReportList reports={state.shiftReports} showBy />
      </Card>
    </AdminLayout>
  )
}
