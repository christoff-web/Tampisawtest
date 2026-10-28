import { AlertTriangle, Check, Info, Minus, Plus, ShieldCheck } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { Badge, Button, Card, Input } from "../components/ui"
import { TermsAgreement } from "../components/terms"
import { prettyDateTime } from "../lib/rules"
import { useI18n, type TKey, type TVars } from "../lib/i18n"
import { en } from "../lib/i18n-en"
import {
  addonLeft,
  cleanPhoneInput,
  phoneProblem,
  lettersOnly,
  healthQuestions,
  kindLabel,
  tierOf,
  waiverRules,
  type Ledger,
} from "../lib/ops"
import type {
  Addon,
  AppState,
  BookingAddon,
  GuestKind,
  GuestMix,
  Tariff,
  Waiver,
} from "../types"

export const peso = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount)

export type TFn = (key: TKey, vars?: TVars) => string

/** English fallback translator for non-component callers that pass no `t`. */
export const tEn: TFn = (key, vars) =>
  (en[key] as string).replace(/\{(\w+)\}/g, (m, k: string) => (vars && k in vars ? String(vars[k]) : m))

/** Localised guest-kind label (display only; stored data stays English). */
export const kindText = (t: TFn, kind: GuestKind) => t(`booking.kind.${kind}` as TKey)

/** Local (not UTC) YYYY-MM-DD for today. */
export const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
export const isPastDate = (date: string) => !!date && date < todayLocal()

/* -------------------------------------------------------------------------- */
/* Two-step confirmation                                                       */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Wizard progress                                                             */
/* -------------------------------------------------------------------------- */

export function WizardProgress({ current }: { current: 1 | 2 | 3 }) {
  const { t } = useI18n()
  const steps = [t("booking.progress.details"), t("booking.progress.waiver"), t("booking.progress.payment")]
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-slate-500">
      {steps.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={`grid size-6 place-items-center rounded-full text-xs ${
              i + 1 < current
                ? "bg-aqua-600 text-white"
                : i + 1 === current
                  ? "bg-aqua-100 text-aqua-800 ring-2 ring-aqua-300"
                  : "bg-slate-200"
            }`}
          >
            {i + 1 < current ? <Check size={12} /> : i + 1}
          </span>
          <span className={i + 1 === current ? "text-ink-900" : ""}>{label}</span>
          {i < steps.length - 1 && <span className="text-slate-300">/</span>}
        </li>
      ))}
    </ol>
  )
}

/* -------------------------------------------------------------------------- */
/* Guest mix                                                                   */
/* -------------------------------------------------------------------------- */

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  label,
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  label: string
}) {
  const { t } = useI18n()
  // The number can be typed. While typing the box holds text, so it can be empty or half-typed; it is cleaned and
  // clamped to min..max when the person leaves the box or presses Enter. Letters, minus signs and decimals never get in.
  const [text, setText] = useState<string | null>(null)
  const commit = (raw: string) => {
    const digits = raw.replace(/\D/g, "")
    setText(null)
    const n = digits === "" ? min : Math.min(max, Math.max(min, parseInt(digits, 10)))
    if (n !== value) onChange(n)
  }
  return (
    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
      <button
        type="button"
        aria-label={t("booking.stepper.fewer", { label })}
        disabled={value <= min}
        className="grid size-11 place-items-center rounded-xl border bg-white disabled:opacity-40"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus size={18} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label={label}
        maxLength={String(max).length}
        value={text ?? String(value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setText(e.target.value.replace(/\D/g, ""))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit(e.currentTarget.value)
          }
        }}
        className="h-11 w-14 rounded-xl border border-slate-300 bg-white text-center text-lg font-extrabold outline-none focus:border-aqua-500 focus:ring-4 focus:ring-aqua-100"
      />
      <button
        type="button"
        aria-label={t("booking.stepper.more", { label })}
        disabled={value >= max}
        className="grid size-11 place-items-center rounded-xl border bg-white disabled:opacity-40"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus size={18} />
      </button>
    </div>
  )
}

export function MixSteppers({
  mix,
  tariff,
  slotId,
  onChange,
}: {
  mix: GuestMix
  tariff: Tariff
  slotId: string
  onChange: (next: GuestMix) => void
}) {
  const { t } = useI18n()
  const rates = tariff.rates[tierOf(slotId)]
  return (
    <div className="grid gap-3">
      {(Object.keys(kindLabel) as GuestKind[]).map((kind) => (
        <div
          key={kind}
          className="flex items-center justify-between gap-3 rounded-2xl bg-sand-100 p-4"
        >
          <div className="min-w-0">
            <p className="font-bold">{kindText(t, kind)}</p>
            <p className="text-xs text-slate-500">
              {t("booking.mix.each", {
                price: peso(rates[kind]),
                note: t(`booking.kindNote.${kind}` as TKey),
              })}
            </p>
          </div>
          <Stepper
            value={mix[kind]}
            label={kindText(t, kind)}
            onChange={(n) => onChange({ ...mix, [kind]: n })}
          />
        </div>
      ))}
      <p className="text-xs leading-5 text-slate-500">
        {t("booking.mix.footnote")}
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Add-ons                                                                     */
/* -------------------------------------------------------------------------- */

export function AddonSelector({
  state,
  date,
  selected,
  onChange,
}: {
  state: AppState
  date: string
  selected: BookingAddon[]
  onChange: (next: BookingAddon[]) => void
}) {
  const { t } = useI18n()
  const active = state.addons.filter((a) => a.active)
  const qtyOf = (a: Addon) => selected.find((s) => s.id === a.id)?.qty ?? 0
  // Drop or trim quantities when the chosen date has less stock.
  useEffect(() => {
    const clamped = selected
      .map((s) => {
        const addon = state.addons.find((a) => a.id === s.id)
        return addon ? { ...s, qty: Math.min(s.qty, addonLeft(state, addon, date)) } : s
      })
      .filter((s) => s.qty > 0)
    if (
      clamped.length !== selected.length ||
      clamped.some((s, i) => s.qty !== selected[i].qty)
    )
      onChange(clamped)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, state.bookings])
  const setQty = (addon: Addon, qty: number) => {
    const rest = selected.filter((s) => s.id !== addon.id)
    onChange(
      qty > 0
        ? [
            ...rest,
            {
              id: addon.id,
              name: addon.name,
              qty,
              price: addon.price,
              deposit: addon.deposit,
            },
          ]
        : rest,
    )
  }
  if (!active.length)
    return <p className="text-sm text-slate-500">{t("booking.addons.none")}</p>
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {active.map((addon) => {
        const left = addonLeft(state, addon, date)
        const qty = qtyOf(addon)
        const soldOut = left === 0
        return (
          <div
            key={addon.id}
            className={`min-w-0 overflow-hidden rounded-2xl border ${qty ? "border-aqua-600 ring-2 ring-aqua-100" : ""}`}
          >
            <img loading="lazy" decoding="async"
              src={addon.image}
              alt={addon.name}
              className={`h-28 w-full object-cover ${soldOut ? "opacity-50 grayscale" : ""}`}
            />
            <div className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-extrabold">{addon.name}</p>
                {soldOut ? (
                  <Badge tone="danger">{t("booking.addons.soldOut")}</Badge>
                ) : (
                  <Badge tone="green">
                    {t("booking.addons.available", { left, cap: addon.dailyCap })}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{addon.description}</p>
              <p className="mt-2 text-sm font-extrabold text-aqua-700">
                {peso(addon.price)}{" "}
                <span className="text-xs font-semibold text-slate-500">{addon.unit}</span>
              </p>
              <p className="text-xs text-slate-500">
                {t("booking.addons.deposit", { amount: peso(addon.deposit) })}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-500">{t("booking.addons.quantity")}</span>
                <Stepper
                  value={qty}
                  max={left}
                  label={addon.name}
                  onChange={(n) => setQty(addon, n)}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Itemized bill                                                               */
/* -------------------------------------------------------------------------- */

function BillRow({
  label,
  value,
  tone = "",
}: {
  label: ReactNode
  value: ReactNode
  tone?: string
}) {
  return (
    <div className={`flex justify-between gap-3 ${tone || "text-slate-500"}`}>
      <span className="min-w-0 break-words">{label}</span>
      <span className="shrink-0 text-right">{value}</span>
    </div>
  )
}

type BillType = "pool" | "cottage" | "room" | "event"

/** Itemized bill: admission by guest type, discount, cottage, add-ons, total. Deposit is shown separately. */
export function ItemizedBill({
  ledger,
  type,
  cottageName,
  roomExcess,
  total,
  statutoryPct,
  addons,
}: {
  ledger: Ledger
  type: BillType
  cottageName?: string
  roomExcess: number
  total: number
  statutoryPct: number
  addons?: BookingAddon[]
}) {
  const { t } = useI18n()
  const admissionApplies = type === "pool" || type === "cottage"
  return (
    <div className="space-y-2 text-sm">
      {type === "room" && (
        <>
          <BillRow label={cottageName || t("booking.bill.roomBase")} value={peso(ledger.cottage)} />
          <BillRow label={t("booking.bill.roomExcess")} value={peso(roomExcess)} />
        </>
      )}
      {type === "event" && (
        <>
          <BillRow label={t("booking.bill.pavilion")} value={peso(ledger.cottage)} />
          <BillRow label={t("booking.bill.poolAccess")} value={t("booking.bill.notIncluded")} tone="text-warning-700" />
          <BillRow label={t("booking.bill.corkage")} value={t("booking.bill.quoted")} />
        </>
      )}
      {admissionApplies && (
        <>
          {ledger.lines.map((l) => (
            <BillRow
              key={l.kind}
              label={`${kindText(t, l.kind)} × ${l.qty} @ ${peso(l.rate)}`}
              value={peso(l.gross)}
            />
          ))}
          {ledger.discount > 0 && (
            <BillRow
              label={t("booking.bill.discount", { pct: statutoryPct })}
              value={`−${peso(ledger.discount)}`}
              tone="text-success-700"
            />
          )}
          {ledger.cottage > 0 && (
            <BillRow label={cottageName || t("booking.bill.cottage")} value={peso(ledger.cottage)} />
          )}
        </>
      )}
      {addons?.map((a) => (
        <BillRow
          key={a.id}
          label={`${a.name} × ${a.qty} @ ${peso(a.price)}`}
          value={peso(a.price * a.qty)}
        />
      ))}
      <div className="flex justify-between gap-3 border-t pt-3 font-bold text-ink-900">
        <span>{t("booking.bill.total")}</span>
        <span>{peso(total)}</span>
      </div>
    </div>
  )
}

export function DepositNote({ amount }: { amount: number }) {
  const { t } = useI18n()
  if (amount <= 0) return null
  return (
    <div className="mt-3 rounded-xl border border-dashed border-aqua-300 bg-aqua-50 p-3 text-xs leading-5 text-aqua-900">
      <div className="flex justify-between gap-3 text-sm font-extrabold">
        <span>{t("booking.deposit.title")}</span>
        <span>{peso(amount)}</span>
      </div>
      {t("booking.deposit.body")}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Waiver, health, minor consent, privacy                                      */
/* -------------------------------------------------------------------------- */

export type WaiverForm = {
  rules: boolean[]
  health: Record<string, "yes" | "no" | undefined>
  healthOther: string
  privacy: boolean
  dpaHealth: boolean
  /** The Terms and Conditions were opened and scrolled to the end. */
  termsRead: boolean
  /** The guest ticked the agreement (only possible after termsRead). */
  terms: boolean
  guardian: {
    name: string
    relationship: string
    contact: string
    signature: string
    confirm: boolean
  }
}

export const emptyWaiverForm = (): WaiverForm => ({
  rules: waiverRules.map(() => false),
  health: {},
  healthOther: "",
  privacy: false,
  dpaHealth: false,
  termsRead: false,
  terms: false,
  guardian: { name: "", relationship: "", contact: "", signature: "", confirm: false },
})

const WAIVER_KEY = "tampisaw-waiver-form"

/** Waiver answers survive Back / refresh within the tab (never leave the browser). */
export function useWaiverForm() {
  const [form, setForm] = useState<WaiverForm>(() => {
    try {
      const raw = sessionStorage.getItem(WAIVER_KEY)
      if (raw) return { ...emptyWaiverForm(), ...JSON.parse(raw) }
    } catch {
      /* ignore */
    }
    return emptyWaiverForm()
  })
  useEffect(() => {
    sessionStorage.setItem(WAIVER_KEY, JSON.stringify(form))
  }, [form])
  return [form, setForm] as const
}

export const clearWaiverForm = () => sessionStorage.removeItem(WAIVER_KEY)

export function waiverMissing(form: WaiverForm, minors: number, t: TFn = tEn): string[] {
  const missing: string[] = []
  if (!form.terms) missing.push("Read and agree to the Terms and Conditions.")
  if (!waiverRules.every((_, i) => form.rules[i]))
    missing.push(t("waiver.missing.rules"))
  if (!healthQuestions.every((q) => form.health[q.id]))
    missing.push(t("waiver.missing.health"))
  if (form.health.other === "yes" && !form.healthOther.trim())
    missing.push(t("waiver.missing.healthOther"))
  if (minors > 0) {
    const g = form.guardian
    if (!g.name.trim() || !g.relationship.trim() || !g.contact.trim())
      missing.push(t("waiver.missing.guardian"))
    if (
      !g.signature.trim() ||
      g.signature.trim().toLowerCase() !== g.name.trim().toLowerCase()
    )
      missing.push(t("waiver.missing.signature"))
    if (!g.confirm) missing.push(t("waiver.missing.confirm"))
  }
  if (!form.privacy) missing.push(t("waiver.missing.privacy"))
  if (!form.dpaHealth)
    missing.push(t("waiver.missing.dpa"))
  return missing
}

export const waiverInputOf = (form: WaiverForm, minors: number) => ({
  rules: waiverRules,
  health: Object.fromEntries(
    healthQuestions.map((q) => [q.id, form.health[q.id] === "yes"]),
  ),
  healthOther: form.health.other === "yes" ? form.healthOther.trim() : undefined,
  dpaConsent: form.privacy && form.dpaHealth,
  guardian:
    minors > 0
      ? {
          name: form.guardian.name.trim(),
          relationship: form.guardian.relationship.trim(),
          contact: form.guardian.contact.trim(),
          signature: form.guardian.signature.trim(),
          minors,
          signedAt: new Date().toISOString(),
        }
      : undefined,
})

function Check_({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
}) {
  return (
    <label className="flex min-w-0 gap-3 rounded-xl bg-sand-100 p-3 text-sm leading-6 text-ink-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1.5 size-4 shrink-0"
      />
      <span className="min-w-0 break-words">{children}</span>
    </label>
  )
}

export function PrivacyNotice({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n()
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
      <summary className="cursor-pointer font-bold text-ink-900">
        {t("waiver.notice.summary")}
      </summary>
      <div className="mt-2 grid gap-2">
        <p>
          {t("waiver.notice.p1")}
          {!compact && t("waiver.notice.p1health")}
        </p>
        <p>{t("waiver.notice.p2")}</p>
      </div>
    </details>
  )
}

export function WaiverStep({
  form,
  setForm,
  minors,
  showErrors,
}: {
  form: WaiverForm
  setForm: (f: WaiverForm) => void
  minors: number
  showErrors: boolean
}) {
  const { t } = useI18n()
  const g = form.guardian
  const setG = (patch: Partial<WaiverForm["guardian"]>) =>
    setForm({ ...form, guardian: { ...g, ...patch } })
  const missing = waiverMissing(form, minors, t)
  const plural = minors === 1 ? "One" : "Many"
  const anyYes = healthQuestions.some((q) => form.health[q.id] === "yes")
  return (
    <div className="grid gap-6">
      <Card className="p-5 sm:p-6">
        <h2 className="text-xl font-extrabold">Terms and Conditions</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">You cannot continue with your booking until you have read and agreed to them.</p>
        <TermsAgreement
          checked={form.terms}
          read={form.termsRead}
          error={showErrors && !form.terms ? "Please read and agree to the Terms and Conditions to continue." : undefined}
          onRead={() => setForm({ ...form, termsRead: true })}
          onChange={(v) => setForm({ ...form, terms: v })}
        />
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-extrabold">
          <ShieldCheck className="text-aqua-700" size={20} /> {t("waiver.rules.title")}
        </h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">
          {t("waiver.rules.sub")}
        </p>
        <div className="grid gap-2">
          {waiverRules.map((rule, i) => (
            <Check_
              key={rule}
              checked={!!form.rules[i]}
              onChange={(v) =>
                setForm({ ...form, rules: form.rules.map((r, j) => (j === i ? v : r)) })
              }
            >
              {i < 3 ? t(`waiver.rule.${i}` as TKey) : rule}
            </Check_>
          ))}
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-xl font-extrabold">{t("waiver.health.title")}</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">
          {t("waiver.health.sub")}
        </p>
        <div className="grid gap-3">
          {healthQuestions.map((q) => {
            const qLabel = t(`waiver.health.${q.id}` as TKey)
            return (
            <fieldset key={q.id} className="min-w-0 rounded-xl border p-3">
              <legend className="sr-only">{qLabel}</legend>
              <p className="break-words text-sm font-semibold">{qLabel}</p>
              <div className="mt-2 flex gap-2">
                {(["no", "yes"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={form.health[q.id] === v}
                    onClick={() =>
                      setForm({ ...form, health: { ...form.health, [q.id]: v } })
                    }
                    className={`min-h-11 flex-1 rounded-xl border text-sm font-bold ${
                      form.health[q.id] === v
                        ? v === "yes"
                          ? "border-warning-500 bg-warning-50 text-warning-900"
                          : "border-aqua-600 bg-aqua-50 text-aqua-800"
                        : "bg-white text-slate-600"
                    }`}
                  >
                    {v === "yes" ? t("waiver.health.yes") : t("waiver.health.no")}
                  </button>
                ))}
              </div>
              {q.id === "other" && form.health.other === "yes" && (
                <div className="mt-3">
                  <Input
                    label={t("waiver.health.otherLabel")}
                    value={form.healthOther}
                    maxLength={200}
                    placeholder={t("waiver.health.otherPlaceholder")}
                    onChange={(e) => setForm({ ...form, healthOther: e.target.value })}
                  />
                </div>
              )}
            </fieldset>
            )
          })}
        </div>
        {anyYes && (
          <p className="mt-4 flex gap-2 rounded-xl bg-warning-50 p-3 text-sm leading-6 text-warning-900">
            <Info size={18} className="mt-0.5 shrink-0" />
            {t("waiver.health.thanks")}
          </p>
        )}
      </Card>

      {minors > 0 && (
        <Card className="p-5 sm:p-6">
          <h2 className="text-xl font-extrabold">{t("waiver.guardian.title")}</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">
            {t(`waiver.guardian.sub${plural}` as TKey, { n: minors })}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t("waiver.guardian.name")}
              value={g.name}
              onChange={(e) => setG({ name: lettersOnly(e.target.value) })}
            />
            <Input
              label={t("waiver.guardian.relationship")}
              placeholder={t("waiver.guardian.relationshipPlaceholder")}
              value={g.relationship}
              onChange={(e) => setG({ relationship: e.target.value })}
            />
            <Input
              label={t("waiver.guardian.contact")}
              className="sm:col-span-1"
              value={g.contact}
              inputMode="tel"
              maxLength={18}
              placeholder={t("waiver.guardian.contactPlaceholder")}
              error={phoneProblem(g.contact) || undefined}
              onChange={(e) => setG({ contact: cleanPhoneInput(e.target.value) })}
            />
            <Input
              label={t("waiver.guardian.signature")}
              value={g.signature}
              onChange={(e) => setG({ signature: e.target.value })}
              error={
                g.signature.trim() &&
                g.name.trim() &&
                g.signature.trim().toLowerCase() !== g.name.trim().toLowerCase()
                  ? t("waiver.guardian.signatureError")
                  : undefined
              }
            />
          </div>
          <div className="mt-4">
            <Check_ checked={g.confirm} onChange={(v) => setG({ confirm: v })}>
              {t(`waiver.guardian.confirm${plural}` as TKey, { n: minors })}
            </Check_>
          </div>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="text-xl font-extrabold">{t("waiver.privacy.title")}</h2>
        <div className="mb-4 mt-3">
          <PrivacyNotice />
        </div>
        <div className="grid gap-2">
          <Check_ checked={form.privacy} onChange={(v) => setForm({ ...form, privacy: v })}>
            {t("waiver.privacy.ack")}
          </Check_>
          <Check_ checked={form.dpaHealth} onChange={(v) => setForm({ ...form, dpaHealth: v })}>
            <strong>{t("waiver.privacy.dpaLabel")}</strong> {t("waiver.privacy.dpa")}
          </Check_>
        </div>
      </Card>

      {showErrors && missing.length > 0 && (
        <div
          role="alert"
          className="flex gap-2 rounded-xl bg-danger-50 p-4 text-sm text-danger-800"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <ul className="grid gap-1">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Read-only accepted waiver record. */
export function WaiverRecord({ waiver }: { waiver?: Waiver }) {
  const { t } = useI18n()
  if (!waiver) return null
  return (
    <div className="min-w-0 rounded-xl border border-success-200 bg-success-50 p-4 text-sm text-success-900">
      <p className="flex items-center gap-2 font-extrabold">
        <ShieldCheck size={16} /> {t("waiver.record.title")}
      </p>
      <dl className="mt-2 grid gap-1 text-xs leading-5">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-bold">{t("waiver.record.accepted")}</dt>
          <dd>{prettyDateTime(waiver.acceptedAt)}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-bold">{t("waiver.record.version")}</dt>
          <dd className="break-all">{waiver.version}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-bold">{t("waiver.record.hash")}</dt>
          <dd className="break-all font-mono">{waiver.hash.slice(0, 16)}…</dd>
        </div>
        {waiver.guardian && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-bold">{t("waiver.record.guardian")}</dt>
            <dd className="break-words">
              {t(waiver.guardian.minors === 1 ? "waiver.record.guardianLineOne" : "waiver.record.guardianLineMany", {
                name: waiver.guardian.name,
                relationship: waiver.guardian.relationship,
                n: waiver.guardian.minors,
              })}
            </dd>
          </div>
        )}
        {waiver.healthOther && (
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-bold">{t("waiver.record.other")}</dt>
            <dd className="break-words">{waiver.healthOther}</dd>
          </div>
        )}
        {waiver.flagged && (
          <p className="mt-1 font-semibold text-warning-800">
            {t("waiver.record.flagged")}
          </p>
        )}
      </dl>
      <p className="mt-2 text-xs text-success-800">
        {t("waiver.record.locked")}
      </p>
    </div>
  )
}
