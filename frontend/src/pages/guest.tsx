import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Coffee,
  Banknote,
  CreditCard,
  Download,
  Edit3,
  Home,
  MapPin,
  Minus,
  Palmtree,
  Plus,
  Printer,
  QrCode,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Timer,
  Upload,
  Users,
  Wallet,
  Waves,
  Wrench,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom"
import { QRCodeSVG } from "qrcode.react"
import { useI18n, type TKey } from "../lib/i18n"
import { PublicLayout } from "../components/layouts"
import {
  Badge,
  Button,
  CapacityBar,
  Card,
  Input,
  Modal,
  PageTitle,
  Select,
  StatusBadge,
  Spinner,
  Skeleton,
  useExit,
} from "../components/ui"
import { ConfirmDialog, useConfirm } from "../components/confirm"
import { initialState } from "../data"
import { homeFor } from "../components/guard"
import { PayQr } from "../components/proof"
import { MyWaitlist, TicketTools, WaitlistJoin } from "./guest-privacy"
import { PasswordField, PhoneField } from "../components/auth-bits"
import { noticeKind, useNotices } from "../components/notifications"
import { CompactCalendar } from "../components/calendar"
import { SiteFooter } from "../components/site-footer"
import { TermsAgreement } from "../components/terms"
import { readProof } from "../lib/proof"
import { useLeaveGuard } from "../components/leave-guard"
import { ImageInput } from "../components/image-input"
import { RescheduleButton } from "../components/reschedule"
import {
  balanceOf,
  holdHours,
  hoursUntil,
  isWithinCutoff,
  needsConfirmation,
  prettyDateTime,
  requiredNow,
} from "../lib/rules"
import { useTampisaw } from "../store"
import {
  buildWaiver,
  computeLedger,
  durationCapFor,
  emptyMix,
  kindLabel,
  mixTotal,
  signQrToken,
  unitAvailability,
  lettersOnly,
  digitsOnly,
  isValidName,
  isValidPhone,
  isValidEmail,
  blocksAvailability,
  canonicalPhone,
  passwordProblems,
  arrivalLabel,
  ageOn,
} from "../lib/ops"
import {
  AddonSelector,
  DepositNote,
  ItemizedBill,
  MixSteppers,
  PrivacyNotice,
  WaiverRecord,
  WaiverStep,
  WizardProgress,
  clearWaiverForm,
  isPastDate,
  peso,
  tEn,
  type TFn,
  todayLocal,
  useWaiverForm,
  waiverInputOf,
  waiverMissing,
} from "./guest-parts"
import type {
  AppState,
  Booking,
  Cottage,
  DraftBooking,
  GuestMix,
  Role,
  Slot,
} from "../types"

export const prettyDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  })

/** Upcoming dates that can still be booked: open days with room left in at least one swim session. */
export function availableDates(state: AppState, days = 60): string[] {
  const out: string[] = []
  const start = new Date(`${todayLocal()}T12:00:00`)
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    if (d.getDay() === 2) continue
    if (state.blackouts.some((b) => b.date === iso && !b.slotId)) continue
    const open = reservationSlots.slice(0, 2).some((slot) => {
      const def = resolveSlot(state.slots, slot.id) ?? slot
      if (!def.active) return false
      if (state.blackouts.some((b) => b.date === iso && b.slotId && canonicalSlotId(b.slotId) === slot.id)) return false
      const used = state.bookings
        .filter((b) => b.date === iso && canonicalSlotId(b.slotId) === slot.id && blocksAvailability(b))
        .reduce((sum, b) => sum + b.guests, 0)
      return used < def.capacity
    })
    if (open) out.push(iso)
  }
  return out
}

function AvailableDatePicker({
  dates,
  value,
  onChange,
}: {
  dates: string[]
  value: string
  onChange: (date: string) => void
}) {
  return <CompactCalendar available={dates} value={value} onChange={onChange} />
}

export const reservationSlots: Slot[] = [
  {
    id: "day-tour",
    label: "Day Tour",
    time: "8:00 AM – 4:00 PM",
    capacity: 120,
    active: true,
  },
  {
    id: "night-swim",
    label: "Night Swimming",
    time: "6:00 PM – 2:00 AM",
    capacity: 100,
    active: true,
  },
  {
    id: "room-stay",
    label: "Room Accommodation",
    time: "2:00 PM – 11:00 AM next day",
    capacity: 36,
    active: true,
  },
  {
    id: "event",
    label: "Pavilion Event",
    time: "Four-hour event block",
    capacity: 150,
    active: true,
  },
]

const legacySlotIds: Record<string, string> = {
  morning: "day-tour",
  afternoon: "night-swim",
  evening: "room-stay",
}

const canonicalSlotId = (slotId: string) => legacySlotIds[slotId] ?? slotId

export const resolveSlot = (slots: Slot[], slotId: string) => {
  const canonicalId = canonicalSlotId(slotId)
  const definition = reservationSlots.find((slot) => slot.id === canonicalId)
  const stored = slots.find((slot) => canonicalSlotId(slot.id) === canonicalId)
  if (!definition) return stored
  return {
    ...definition,
    capacity: stored?.capacity ?? definition.capacity,
    active: stored?.active ?? definition.active,
  }
}

const reconcileCatalog = (items: Cottage[]) => {
  const canonical = initialState.cottages.map((definition) => {
    const current = items.find((item) => item.id === definition.id)
    return {
      ...definition,
      units: current?.units ?? definition.units,
      image: current?.image ?? definition.image,
      status: current?.status ?? definition.status,
    }
  })
  const customItems = items.filter(
    (item) =>
      item.kind &&
      !initialState.cottages.some((definition) => definition.id === item.id),
  )
  return [...canonical, ...customItems]
}

/** Guest mix of a draft; falls back to the legacy adults/children counts. */
const mixOfDraft = (draft: DraftBooking): GuestMix =>
  draft.mix ?? {
    ...emptyMix(),
    adult: draft.adults,
    child: draft.children,
  }

/** Mix of a stored booking, if it was priced with guest types. */
const mixOfBooking = (b: Booking): GuestMix | undefined => b.mix

/** One consolidated ledger for the draft (room/event bookings do not pay admission). */
function ledgerOfDraft(state: AppState, draft: DraftBooking, cottage?: Cottage) {
  const admission = draft.type === "pool" || draft.type === "cottage"
  const ledger = computeLedger(
    state.tariff,
    canonicalSlotId(draft.slotId),
    admission ? mixOfDraft(draft) : emptyMix(),
    cottage?.price ?? 0,
    draft.addons ?? [],
  )
  const roomExcess =
    draft.type === "room" ? Math.max(0, draft.guests - 6) * 250 : 0
  return { ledger, roomExcess, total: ledger.total + roomExcess }
}

/** Ledger for a stored booking (null for legacy bookings made before guest types). */
function ledgerOfBooking(state: AppState, b: Booking, cottage?: Cottage) {
  const mix = mixOfBooking(b)
  if (!mix) return null
  const admission = b.type === "pool" || b.type === "cottage"
  const ledger = computeLedger(
    state.tariff,
    canonicalSlotId(b.slotId),
    admission ? mix : emptyMix(),
    cottage?.price ?? 0,
    b.addons ?? [],
  )
  const roomExcess = b.type === "room" ? Math.max(0, b.guests - 6) * 250 : 0
  return { ledger, roomExcess }
}

export function LandingPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { state, dispatch, currentUser } = useTampisaw()
  const isGuest = currentUser?.role === "guest"
  const openDates = availableDates(state)
  const [date, setDate] = useState(() => (openDates.includes(state.draft.date) ? state.draft.date : (openDates[0] ?? "")))
  const [dateError, setDateError] = useState("")
  const catalog = reconcileCatalog(state.cottages)
  return (
    <PublicLayout>
      <main>
        <section className="relative isolate min-h-[670px] overflow-hidden">
          <img fetchPriority="high" decoding="async"
            className="absolute inset-0 -z-20 h-full w-full object-cover"
            src="/golden-pyramid/cutouts/day-view.jpg"
            alt={t("landing.heroAlt")}
          />
          <div className="absolute inset-0 -z-10 bg-ink-950/75" />
          <div className="mx-auto flex min-h-[670px] max-w-7xl items-center px-4 py-16 sm:px-6 lg:px-8">
            <div className="stagger max-w-2xl text-white">
              <Badge tone="info">
                <Sparkles size={13} className="mr-1" /> {t("landing.heroBadge")}
              </Badge>
              <h1 className="mt-6 text-4xl min-[400px]:text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-7xl">
                {t("landing.heroTitle")}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-200">
                {t("landing.heroText")}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                {isGuest ? (
                  <Button className="px-6" onClick={() => navigate("/book")}>
                    {t("landing.bookVisit")} <ArrowRight size={18} />
                  </Button>
                ) : !currentUser ? (
                  <Button className="px-6" onClick={() => navigate("/login")}>
                    {t("landing.logIn")} <ArrowRight size={18} />
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                  onClick={() =>
                    document
                      .getElementById("cottages")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  {t("landing.exploreCottages")}
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-5 text-sm font-semibold text-slate-200">
                <a
                  href="https://maps.app.goo.gl/RbM3UtowLGxQVgUN6"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 underline-offset-4 transition hover:text-white hover:underline"
                  title={t("landing.openMaps")}
                >
                  <MapPin size={17} /> {t("landing.quezonCity")}
                </a>
                <span className="flex items-center gap-2">
                  <Clock3 size={17} /> {t("landing.hours")}
                </span>
              </div>
            </div>
          </div>
          {isGuest && (
          <Card animate className="relative mx-4 -mt-24 grid gap-4 p-5 sm:mx-auto sm:max-w-5xl sm:grid-cols-[1fr_auto] sm:p-6">
            <div>
              <p className="mb-2 text-sm font-semibold text-ink-800">{t("landing.visitDate")}</p>
              <AvailableDatePicker dates={openDates} value={date} onChange={setDate} />
            </div>
            <Button
              className="self-end sm:min-h-12"
              disabled={!openDates.includes(date)}
              onClick={() => {
                if (!openDates.includes(date)) return
                dispatch({
                  type: "DRAFT",
                  payload: { date },
                })
                navigate("/book")
              }}
            >
              {t("landing.checkAvail")} <ArrowRight size={17} />
            </Button>
          </Card>
          )}
        </section>

        <section className={`mx-auto max-w-7xl px-4 pb-18 sm:px-6 lg:px-8 ${isGuest ? "pt-40" : "pt-20"}`}>
          <div className="mb-10 text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-aqua-700">
              {t("landing.stepsEyebrow")}
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl">
              {t("landing.stepsTitle")}
            </h2>
          </div>
          <div className="stagger grid gap-5 md:grid-cols-3">
            {[
              [
                CalendarDays,
                t("landing.step1Title"),
                t("landing.step1Text"),
              ],
              [
                Palmtree,
                t("landing.step2Title"),
                t("landing.step2Text"),
              ],
              [
                QrCode,
                t("landing.step3Title"),
                t("landing.step3Text"),
              ],
            ].map(([Icon, title, text]) => (
              <Card className="p-6" key={String(title)}>
                <span className="mb-5 grid size-12 place-items-center rounded-2xl bg-aqua-100 text-aqua-700">
                  <Icon size={24} />
                </span>
                <h3 className="text-lg font-extrabold">{String(title)}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {String(text)}
                </p>
              </Card>
            ))}
          </div>
        </section>

        <section id="cottages" className="bg-white py-18">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <PageTitle
              eyebrow={t("landing.exploreEyebrow")}
              title={t("landing.exploreTitle")}
              description={t("landing.exploreDesc")}
              action={
                isGuest ? (
                  <Button variant="secondary" onClick={() => navigate("/book")}>
                    {t("landing.bookVisit")}
                  </Button>
                ) : undefined
              }
            />

            <div className="mb-12">
              <h3 className="mb-5 text-2xl font-extrabold">{t("landing.entranceFees")}</h3>
              <div className="grid gap-5 md:grid-cols-2">
                <Card className="overflow-hidden">
                  <img loading="lazy" decoding="async"
                    src="/golden-pyramid/cutouts/day-view.jpg"
                    alt={t("landing.dayAlt")}
                    className="h-56 w-full object-cover"
                  />
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-xl font-extrabold">{t("landing.dayTour")}</h4>
                        <p className="mt-1 text-sm font-semibold text-aqua-700">
                          8:00 AM–4:00 PM
                        </p>
                      </div>
                      <Badge tone="info">{t("landing.closedTue")}</Badge>
                    </div>
                    <div className="mt-5 divide-y text-sm">
                      <div className="flex justify-between py-3">
                        <span>{t("landing.age6")}</span>
                        <strong>₱250</strong>
                      </div>
                      <div className="flex justify-between py-3">
                        <span>{t("landing.age3to5")}</span>
                        <strong>₱180</strong>
                      </div>
                      <div className="flex justify-between py-3">
                        <span>{t("landing.age2")}</span>
                        <strong className="text-success-700">{t("landing.free")}</strong>
                      </div>
                    </div>
                  </div>
                </Card>
                <Card className="overflow-hidden">
                  <img loading="lazy" decoding="async"
                    src="/golden-pyramid/cutouts/night-view.jpg"
                    alt={t("landing.nightAlt")}
                    className="h-56 w-full object-cover"
                  />
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-xl font-extrabold">{t("landing.nightSwim")}</h4>
                        <p className="mt-1 text-sm font-semibold text-aqua-700">
                          6:00 PM–2:00 AM
                        </p>
                      </div>
                      <Badge tone="info">{t("landing.cottagesTill3")}</Badge>
                    </div>
                    <div className="mt-5 divide-y text-sm">
                      <div className="flex justify-between py-3">
                        <span>{t("landing.age6")}</span>
                        <strong>₱300</strong>
                      </div>
                      <div className="flex justify-between py-3">
                        <span>{t("landing.age3to5")}</span>
                        <strong>₱180</strong>
                      </div>
                      <div className="flex justify-between py-3">
                        <span>{t("landing.age2")}</span>
                        <strong className="text-success-700">{t("landing.free")}</strong>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            <div className="mb-12">
              <div className="mb-5">
                <h3 className="text-2xl font-extrabold">{t("landing.rooms")}</h3>
                <p className="mt-2 text-sm text-slate-500">
                  {t("landing.roomsNote")}
                </p>
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                {catalog
                  .filter((item) => item.kind === "room")
                  .map((item) => (
                    <ExploreOfferingCard key={item.id} item={item} />
                  ))}
              </div>
            </div>

            <div className="mb-12">
              <div className="mb-5">
                <h3 className="text-2xl font-extrabold">
                  {t("landing.cottagesTables")}
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  {t("landing.cottagesNote")}
                </p>
              </div>
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                {catalog
                  .filter((item) => item.kind === "cottage")
                  .map((item) => (
                    <ExploreOfferingCard key={item.id} item={item} />
                  ))}
              </div>
            </div>

            <div className="mb-12">
              <div className="mb-5">
                <h3 className="text-2xl font-extrabold">{t("landing.events")}</h3>
                <p className="mt-2 text-sm text-slate-500">
                  {t("landing.eventsNote")}
                </p>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                {catalog
                  .filter((item) => item.kind === "event")
                  .map((item) => (
                    <ExploreOfferingCard key={item.id} item={item} />
                  ))}
              </div>
              <p className="mt-4 rounded-xl bg-warning-50 p-4 text-sm leading-6 text-warning-900">
                {t("landing.eventsWarn")}
              </p>
            </div>

            <div className="rounded-2xl bg-ink-950 p-6 text-white sm:p-8">
              <h3 className="text-2xl font-extrabold">{t("landing.policies")}</h3>
              <div className="mt-5 grid gap-5 text-sm leading-6 text-slate-300 md:grid-cols-2">
                {state.policies.map((p) => (
                  <div key={p.id}>
                    <p className="font-bold text-white">{p.title}</p>
                    <p className="whitespace-pre-line">{p.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <SiteFooter place={t("landing.footerPlace")} mapLabel={t("landing.footerMap")} photos={t("landing.footerPhotos")} />
      </main>
    </PublicLayout>
  )
}

function ExploreOfferingCard({ item }: { item: Cottage }) {
  const { t } = useI18n()
  return (
    <Card className="overflow-hidden">
      <img loading="lazy" decoding="async"
        src={item.image}
        alt={item.name}
        className="h-48 w-full object-cover"
      />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge tone={item.kind === "event" ? "warning" : "info"}>
              {t(`landing.kind.${item.kind}` as TKey)}
            </Badge>
            <h4 className="mt-3 font-extrabold">{item.name}</h4>
          </div>
          <p className="whitespace-nowrap font-extrabold text-aqua-700">
            {peso(item.price)}
          </p>
        </div>
        <ul className="mt-4 grid gap-2 text-xs leading-5 text-slate-500">
          {item.amenities.map((amenity) => (
            <li key={amenity} className="flex gap-2">
              <Check size={14} className="mt-0.5 shrink-0 text-success-600" />
              {amenity}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { login, register, currentUser } = useTampisaw()
  const [error, setError] = useState("")
  const [termsRead, setTermsRead] = useState(false)
  const [termsOk, setTermsOk] = useState(false)
  const [termsError, setTermsError] = useState("")
  const [fields, setFields] = useState({
    name: "",
    email: params.get("email") ?? "",
    phone: "",
    password: "",
    birthdate: "",
  })
  const set = (key: keyof typeof fields, value: string) => {
    setFields((f) => ({ ...f, [key]: value }))
    setError("")
  }
  const { dialog: leaveDialog, allowLeave } = useLeaveGuard(
    mode === "signup" && !!(fields.name || fields.phone || fields.password || fields.birthdate),
    t("auth.leaveWarn"),
  )
  const next = params.get("next")
  const safeNext = next && next.startsWith("/") ? next : null
  const destination = (role: Role) =>
    role === "guest" ? (safeNext ?? homeFor(role)) : homeFor(role)
  if (currentUser) return <Navigate to={destination(currentUser.role)} replace />
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!fields.email.trim() || !fields.password)
      return setError(t("auth.errCreds"))
    if (mode === "login") {
      const result = await login(fields.email, fields.password)
      if (!result.ok) {
        setFields((f) => ({ ...f, password: "" }))
        // Wrong password keeps the usual message; lock-outs and server problems say what happened.
        return setError(/too many|server|reach|deactivated/i.test(result.error) ? result.error : t("auth.errDenied"))
      }
      navigate(destination(result.user.role), { replace: true })
      return
    }
    if (!isValidEmail(fields.email))
      return setError(t("auth.errEmail"))
    if (!isValidName(fields.name)) return setError(t("auth.errName"))
    if (!isValidPhone(fields.phone))
      return setError(t("auth.errPhone"))
    if (!fields.birthdate) return setError(t("auth.errBirth"))
    if (ageOn(fields.birthdate) < 18)
      return setError(t("auth.errAge"))
    const weak = passwordProblems(fields.password)
    if (weak.length) return setError(`Your password still needs: ${weak.join("; ").toLowerCase()}.`)
    if (!termsOk) {
      setTermsError("You must read and agree to the Terms and Conditions to create an account.")
      return setError("Please read and accept the Terms and Conditions first.")
    }
    const result = await register({
      name: fields.name,
      email: fields.email,
      phone: canonicalPhone(fields.phone) ?? fields.phone,
      password: fields.password,
      birthdate: fields.birthdate,
    })
    if (!result.ok) return setError(result.error)
    allowLeave()
    navigate(
      `/login?created=1&email=${encodeURIComponent(result.user.email)}${
        safeNext ? `&next=${encodeURIComponent(safeNext)}` : ""
      }`,
      { replace: true },
    )
  }
  return (
    <PublicLayout>
      {leaveDialog}
      <main className="grid min-h-[calc(100vh-72px)] place-items-center px-4 py-10">
        <Card className="grid w-full max-w-5xl overflow-hidden lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative hidden min-h-[650px] lg:block">
            <img loading="lazy" decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              src="/golden-pyramid/pool-fountains.jpg"
              alt={t("auth.sideAlt")}
            />
            <div className="absolute inset-0 bg-ink-950/60" />
            <div className="absolute bottom-0 p-9 text-white">
              <Waves size={34} />
              <h2 className="mt-4 text-3xl font-extrabold">
                {t("auth.sideTitle")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                {t("auth.sideText")}
              </p>
            </div>
          </div>
          <div className="p-6 sm:p-10 lg:p-12">
            <div className="mb-4 flex justify-end">
            </div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-aqua-700">
              {mode === "login" ? t("auth.welcomeBack") : t("auth.join")}
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
              {mode === "login"
                ? t("auth.loginTitle")
                : t("auth.signupTitle")}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {mode === "login"
                ? t("auth.loginSub")
                : t("auth.signupSub")}
            </p>
            {mode === "login" && params.get("created") && (
              <p
                role="status"
                className="mt-5 rounded-xl bg-success-50 p-3 text-sm font-semibold text-success-800"
              >
                {t("auth.created")}
              </p>
            )}
            <form className="mt-6 grid gap-5" onSubmit={submit} noValidate>
              {mode === "signup" && (
                <Input
                  name="name"
                  label={t("auth.fullName")}
                  placeholder={t("auth.namePh")}
                  value={fields.name}
                  autoComplete="name"
                  onChange={(e) => set("name", lettersOnly(e.target.value))}
                />
              )}
              <Input
                name="email"
                label={t("auth.email")}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={fields.email}
                onChange={(e) => set("email", e.target.value)}
              />
              {mode === "signup" && (
                <PhoneField label={t("auth.mobile")} name="phone" value={fields.phone} onChange={(v) => set("phone", v)} />
              )}
              {mode === "signup" && (
                <Input
                  name="birthdate"
                  label={t("auth.dob")}
                  type="date"
                  max={todayLocal()}
                  value={fields.birthdate}
                  onChange={(e) => set("birthdate", e.target.value)}
                />
              )}
              <div>
                <PasswordField
                  label={t("auth.password")}
                  placeholder={mode === "login" ? undefined : t("auth.passwordPh")}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  rules={mode === "signup"}
                  value={fields.password}
                  onChange={(v) => set("password", v)}
                />
                {mode === "login" && (
                  <p className="mt-2 text-right text-sm">
                    <Link className="font-bold text-aqua-700" to={`/forgot-password${fields.email.trim() ? `?email=${encodeURIComponent(fields.email.trim())}` : ""}`}>
                      Forgot password?
                    </Link>
                  </p>
                )}
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-danger-50 p-3 text-sm font-semibold text-danger-700"
                >
                  {error}
                </p>
              )}
              {mode === "signup" && (
                <div className="grid gap-2">
                  <PrivacyNotice compact />
                  <TermsAgreement
                    checked={termsOk}
                    read={termsRead}
                    error={termsError}
                    onRead={() => setTermsRead(true)}
                    onChange={(v) => {
                      setTermsOk(v)
                      setTermsError("")
                      setError("")
                    }}
                  />
                </div>
              )}
              <Button type="submit" className="w-full">
                {mode === "login" ? t("landing.logIn") : t("auth.createAccount")}{" "}
                <ArrowRight size={17} />
              </Button>
            </form>
            <p className="mt-7 text-center text-sm text-slate-500">
              {mode === "login"
                ? t("auth.newHere")
                : t("auth.haveAccount")}{" "}
              <Link
                className="font-bold text-aqua-700"
                to={mode === "login" ? "/signup" : "/login"}
              >
                {mode === "login" ? t("auth.signUp") : t("landing.logIn")}
              </Link>
            </p>
          </div>
        </Card>
      </main>
    </PublicLayout>
  )
}

export function BookingPage() {
  const { t } = useI18n()
  const { state, dispatch, currentUser } = useTampisaw()
  const navigate = useNavigate()
  const draft = state.draft
  const catalog = reconcileCatalog(state.cottages)
  const guestTimeSlots = reservationSlots
    .slice(0, 2)
    .map((slot) => resolveSlot(state.slots, slot.id) ?? slot)
  const [holdId] = useState(() => {
    const existing = sessionStorage.getItem("tampisaw-hold")
    if (existing) return existing
    const id = `HOLD-${Date.now()}`
    sessionStorage.setItem("tampisaw-hold", id)
    return id
  })
  const [secondsLeft, setSecondsLeft] = useState(600)
  const [waitlisted, setWaitlisted] = useState("")
  const { dialog: leaveDialog } = useLeaveGuard(
    draft.guests > 0 || !!draft.cottageId || (draft.addons?.length ?? 0) > 0,
    undefined,
    () => {
      dispatch({ type: "RELEASE_HOLD", id: holdId })
      sessionStorage.removeItem("tampisaw-hold")
    },
    ["/checkout", "/login", "/signup"],
  )
  useEffect(() => {
    if (currentUser)
      dispatch({
        type: "DRAFT",
        payload: {
          name: currentUser.name,
          email: currentUser.email,
          phone: currentUser.phone,
        },
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id])
  const isTuesday = new Date(`${draft.date}T12:00:00`).getDay() === 2
  const blocked =
    state.blackouts.find(
      (item) =>
        item.date === draft.date &&
        (!item.slotId ||
          canonicalSlotId(item.slotId) === canonicalSlotId(draft.slotId)),
    ) ||
    (isTuesday
      ? { reason: t("booking.date.tuesdayReason") }
      : undefined)
  useEffect(() => {
    if (!draft.date || !draft.slotId || blocked) return
    dispatch({
      type: "HOLD",
      payload: {
        id: holdId,
        date: draft.date,
        slotId: draft.slotId,
        guests: draft.guests,
        cottageId: draft.cottageId,
        eventStart: draft.type === "event" ? draft.eventStart : undefined,
      },
    })
    setSecondsLeft(600)
  }, [
    blocked,
    dispatch,
    draft.cottageId,
    draft.eventStart,
    draft.type,
    draft.date,
    draft.guests,
    draft.slotId,
    holdId,
  ])
  useEffect(() => {
    const timer = window.setInterval(
      () => setSecondsLeft((value) => Math.max(0, value - 1)),
      1000,
    )
    return () => window.clearInterval(timer)
  }, [])
  const usedCapacity = (slotId: string) =>
    state.bookings
      .filter(
        (booking) =>
          booking.date === draft.date &&
          canonicalSlotId(booking.slotId) === canonicalSlotId(slotId) &&
          blocksAvailability(booking),
      )
      .reduce((sum, booking) => sum + booking.guests, 0) +
    state.holds
      .filter(
        (hold) =>
          hold.id !== holdId &&
          hold.date === draft.date &&
          canonicalSlotId(hold.slotId) === canonicalSlotId(slotId) &&
          new Date(hold.expiresAt).getTime() > Date.now(),
      )
      .reduce((sum, hold) => sum + hold.guests, 0)
  const selectedCottage = catalog.find(
    (cottage) => cottage.id === draft.cottageId,
  )
  const mix = mixOfDraft(draft)
  const { ledger, roomExcess, total: summaryTotal } = ledgerOfDraft(
    state,
    draft,
    selectedCottage,
  )
  const cottageCap = durationCapFor(state.tariff, canonicalSlotId(draft.slotId))
  const cottageHours = Math.max(1, Math.min(draft.cottageHours ?? cottageCap, cottageCap))
  const [dateError, setDateError] = useState("")
  const openDates = availableDates(state)
  useEffect(() => {
    if (openDates.length && !openDates.includes(draft.date))
      dispatch({ type: "DRAFT", payload: { date: openDates[0] } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const hasSupervisor = mix.adult + mix.senior + mix.pwd > 0
  const setMix = (next: GuestMix) =>
    dispatch({
      type: "DRAFT",
      payload: {
        mix: next,
        adults: next.adult + next.senior + next.pwd,
        children: next.child,
        discounts: 0,
        guests: mixTotal(next),
      },
    })
  // Normalise legacy drafts (adults/children/toddlers) into a guest mix once.
  useEffect(() => {
    if (!draft.mix) setMix(mixOfDraft({ ...draft, adults: draft.adults, children: draft.children }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const conflictMsg = blocked ? null : findConflict(state, draft, undefined, t, currentUser?.guestId, holdId)
  const chooseSlot = (slotId: string) => {
    if (slotId === "room-stay") {
      dispatch({
        type: "DRAFT",
        payload: {
          slotId,
          type: "room",
          cottageId:
            selectedCottage?.kind === "room" ? selectedCottage.id : undefined,
        },
      })
      return
    }
    if (slotId === "event") {
      dispatch({
        type: "DRAFT",
        payload: {
          slotId,
          type: "event",
          cottageId:
            selectedCottage?.kind === "event" ? selectedCottage.id : undefined,
        },
      })
      return
    }
    dispatch({
      type: "DRAFT",
      payload: {
        slotId,
        type:
          draft.type === "cottage" || draft.type === "pool"
            ? draft.type
            : "pool",
        cottageId:
          draft.type === "cottage" && selectedCottage?.kind === "cottage"
            ? selectedCottage.id
            : undefined,
      },
    })
  }
  return (
    <PublicLayout>
      {leaveDialog}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <WizardProgress current={1} />
        <PageTitle
          eyebrow={t("booking.page.eyebrow")}
          title={t("booking.page.title")}
          description={t("booking.page.description")}
        />
        <div className="grid items-start gap-7 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-6">
            <Card className="p-5 sm:p-7">
              <Step number="1" title={t("booking.step1.title")} />
              <p className="mb-3 text-sm font-semibold text-ink-800">{t("booking.date.label")}</p>
              <AvailableDatePicker
                dates={openDates}
                value={draft.date}
                onChange={(date) => {
                  setDateError("")
                  dispatch({ type: "DRAFT", payload: { date } })
                }}
              />
              {dateError && <p className="mt-2 text-xs font-medium text-danger-600">{dateError}</p>}
              {draft.date && !openDates.includes(draft.date) && (
                <p className="mt-3 rounded-xl bg-warning-50 p-3 text-sm font-bold text-warning-900">
                  {t("booking.date.notOpen")}
                </p>
              )}
              {isTuesday && (
                <p className="mt-3 rounded-xl bg-danger-50 p-3 text-sm font-bold text-danger-700">
                  {t("booking.date.tuesday")}
                </p>
              )}
            </Card>
            <Card className="p-5 sm:p-7">
              <Step number="2" title={t("booking.step2.title")} />
              {draft.type === "room" || draft.type === "event" ? (
                <p className="mb-4 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-900">
                  {draft.type === "room"
                    ? t("booking.party.room")
                    : t("booking.party.event")}
                </p>
              ) : null}
              <MixSteppers
                mix={mix}
                tariff={state.tariff}
                slotId={canonicalSlotId(draft.slotId)}
                onChange={setMix}
              />
              {!hasSupervisor && (
                <p className="mt-3 rounded-xl bg-warning-50 p-3 text-xs font-semibold text-warning-900">
                  {t("booking.party.needSupervisor")}
                </p>
              )}
            </Card>
            <Card className="p-5 sm:p-7">
              <Step number="3" title={t("booking.step3.title")} />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {guestTimeSlots.map((slot) => {
                  const used = usedCapacity(slot.id)
                  const remaining = slot.capacity - used
                  const closure = state.blackouts.find(
                    (item) =>
                      item.date === draft.date &&
                      (!item.slotId ||
                        canonicalSlotId(item.slotId) === slot.id),
                  )
                  const full = remaining < draft.guests
                  const disabled = !slot.active || !!closure
                  return (
                    <button
                      key={slot.id}
                      disabled={disabled}
                      onClick={() => {
                        if (full) setWaitlisted(slot.id)
                        else chooseSlot(slot.id)
                      }}
                      className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        canonicalSlotId(draft.slotId) === slot.id
                          ? "border-aqua-600 bg-aqua-50 ring-2 ring-aqua-100"
                          : "hover:border-aqua-300"
                      }`}
                    >
                      <p className="font-extrabold">{slot.label}</p>
                      <p className="mt-1 text-xs text-slate-500">{slot.time}</p>
                      {canonicalSlotId(draft.slotId) === slot.id && (
                        <p className="mt-2 flex items-center gap-1 text-xs font-extrabold text-aqua-700">
                          <Check size={13} /> {t("booking.slot.selected")}
                        </p>
                      )}
                      <div className="my-3">
                        <CapacityBar value={used} max={slot.capacity} />
                      </div>
                      <p
                        className={`text-xs font-bold ${
                          remaining < 15 ? "text-warning-700" : "text-success-700"
                        }`}
                      >
                        {closure
                          ? t("booking.slot.closed", { reason: closure.reason })
                          : full
                            ? waitlisted === slot.id
                              ? t("booking.slot.waitlistSelected")
                              : t("booking.slot.fullJoin")
                            : t("booking.slot.spotsLeft", { n: remaining })}
                      </p>
                    </button>
                  )
                })}
              </div>
              {waitlisted && (
                <WaitlistJoin
                  date={draft.date}
                  slotId={canonicalSlotId(waitlisted)}
                  guests={draft.guests}
                  what={guestTimeSlots.find((s) => s.id === canonicalSlotId(waitlisted))?.label ?? t("booking.slot.thisSession")}
                />
              )}
            </Card>
            <Card className="p-5 sm:p-7">
              <Step number="4" title={t("booking.step4.title")} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice
                  selected={draft.type === "pool"}
                  onClick={() =>
                    dispatch({
                      type: "DRAFT",
                      payload: {
                        type: "pool",
                        slotId:
                          canonicalSlotId(draft.slotId) === "room-stay" ||
                          canonicalSlotId(draft.slotId) === "event"
                            ? "day-tour"
                            : draft.slotId,
                        cottageId: undefined,
                      },
                    })
                  }
                  icon={<Waves />}
                  title={t("booking.type.pool.title")}
                  text={t("booking.type.pool.text")}
                />
                <Choice
                  selected={draft.type === "cottage"}
                  onClick={() =>
                    dispatch({
                      type: "DRAFT",
                      payload: {
                        type: "cottage",
                        slotId:
                          canonicalSlotId(draft.slotId) === "room-stay" ||
                          canonicalSlotId(draft.slotId) === "event"
                            ? "night-swim"
                            : draft.slotId,
                      },
                    })
                  }
                  icon={<Palmtree />}
                  title={t("booking.type.cottage.title")}
                  text={t("booking.type.cottage.text")}
                />
                <Choice
                  selected={draft.type === "room"}
                  onClick={() =>
                    dispatch({
                      type: "DRAFT",
                      payload: {
                        type: "room",
                        slotId: "room-stay",
                        cottageId: undefined,
                      },
                    })
                  }
                  icon={<Home />}
                  title={t("booking.type.room.title")}
                  text={t("booking.type.room.text")}
                />
                <Choice
                  selected={draft.type === "event"}
                  onClick={() =>
                    dispatch({
                      type: "DRAFT",
                      payload: {
                        type: "event",
                        slotId: "event",
                        cottageId: undefined,
                      },
                    })
                  }
                  icon={<Sparkles />}
                  title={t("booking.type.event.title")}
                  text={t("booking.type.event.text")}
                />
              </div>
              {draft.type === "event" && (
                <div className="mt-5">
                  <Select
                    label={t("booking.event.label")}
                    value={draft.eventStart}
                    onChange={(event) =>
                      dispatch({
                        type: "DRAFT",
                        payload: { eventStart: event.target.value },
                      })
                    }
                  >
                    <option value="8:00 AM – 12:00 PM">
                      {t("booking.event.fourHours", { range: "8:00 AM – 12:00 PM" })}
                    </option>
                    <option value="1:00 PM – 5:00 PM">
                      {t("booking.event.fourHours", { range: "1:00 PM – 5:00 PM" })}
                    </option>
                    <option value="6:00 PM – 10:00 PM">
                      {t("booking.event.fourHours", { range: "6:00 PM – 10:00 PM" })}
                    </option>
                  </Select>
                </div>
              )}
              {(draft.type === "cottage" ||
                draft.type === "room" ||
                draft.type === "event") && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {catalog
                    .filter((item) => item.kind === draft.type)
                    .map((cottage) => {
                      const avail = unitAvailability(
                        state,
                        cottage,
                        draft.date,
                        draft.slotId,
                        { eventStart: draft.eventStart, holdId, guestId: currentUser?.guestId },
                      )
                      const locked = avail.left <= 0
                      const overCapacity =
                        cottage.kind !== "room" &&
                        draft.guests > cottage.capacity
                      return (
                        <div key={cottage.id}>
                        <button
                          disabled={
                            cottage.status !== "available" ||
                            locked ||
                            overCapacity
                          }
                          onClick={() =>
                            dispatch({
                              type: "DRAFT",
                              payload: { cottageId: cottage.id },
                            })
                          }
                          className={`overflow-hidden rounded-2xl border text-left transition disabled:opacity-50 ${
                            draft.cottageId === cottage.id
                              ? "border-aqua-600 ring-2 ring-aqua-100"
                              : ""
                          }`}
                        >
                          <img loading="lazy" decoding="async"
                            src={cottage.image}
                            alt={cottage.name}
                            className="h-32 w-full object-cover"
                          />
                          <div className="p-4">
                            <div className="flex justify-between">
                              <p className="font-extrabold">{cottage.name}</p>
                              <Badge
                                tone={
                                  cottage.status === "available" && !locked && !overCapacity
                                    ? "green"
                                    : "red"
                                }
                              >
                                {locked
                                  ? avail.blockedBy
                                    ? t("booking.unit.unavailable")
                                    : t("booking.unit.taken")
                                  : overCapacity
                                    ? t("booking.unit.tooSmall")
                                    : cottage.status !== "available"
                                      ? cottage.status
                                      : t("booking.unit.availableOf", { left: avail.left, total: avail.total })}
                              </Badge>
                            </div>
                            {avail.blockedBy && (
                              <p className="mt-2 text-xs font-semibold text-warning-700">{avail.blockedBy}</p>
                            )}
                            <p className="mt-2 text-xs text-slate-500">
                              {t("booking.unit.upTo", {
                                n: cottage.capacity,
                                amenities: cottage.amenities.slice(0, 2).join(" · "),
                              })}
                            </p>
                            <p className="mt-2 text-xs leading-5 text-slate-500">
                              {cottage.kind === "room"
                                ? t("booking.unit.roomNote")
                                : cottage.kind === "event"
                                  ? t("booking.unit.eventNote")
                                  : t("booking.unit.cottageNote", { hours: cottageCap })}
                            </p>
                            <p className="mt-3 font-extrabold text-aqua-700">
                              {cottage.price
                                ? peso(cottage.price)
                                : t("booking.unit.baseRate")}
                            </p>
                          </div>
                        </button>
                        {locked && cottage.status === "available" && (
                          <WaitlistJoin date={draft.date} slotId={canonicalSlotId(draft.slotId)} cottageId={cottage.id} guests={draft.guests} what={cottage.name} />
                        )}
                        </div>
                      )
                    })}
                </div>
              )}
            </Card>
            <Card className="p-5 sm:p-7">
              <Step number="5" title={t("booking.step5.title")} />
              <p className="-mt-2 mb-4 text-sm text-slate-500">
                {t("booking.addons.title", { date: prettyDate(draft.date) })}
              </p>
              <AddonSelector
                state={state}
                date={draft.date}
                selected={draft.addons ?? []}
                onChange={(addons) =>
                  dispatch({ type: "DRAFT", payload: { addons } })
                }
              />
            </Card>
          </div>
          <Card className="min-w-0 p-6 lg:sticky lg:top-24">
            <div className="flex items-center justify-between gap-3">
              <p className="text-lg font-extrabold">{t("booking.summary.title")}</p>
              <Badge tone={secondsLeft < 120 ? "warning" : "info"}>
                <Timer size={13} className="mr-1" />
                {t("booking.summary.held", {
                  time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`,
                })}
              </Badge>
            </div>
            <div className="my-5 grid gap-3 border-y py-5 text-sm">
              <SummaryRow
                icon={<CalendarDays />}
                label={prettyDate(draft.date)}
              />
              <SummaryRow
                icon={<Clock3 />}
                label={
                  resolveSlot(state.slots, draft.slotId)?.time ||
                  t("booking.summary.chooseSlot")
                }
              />
              <SummaryRow icon={<Users />} label={t("booking.summary.guests", { n: draft.guests })} />
              {draft.type === "event" && draft.eventStart && (
                <SummaryRow icon={<Clock3 />} label={draft.eventStart} />
              )}
              {selectedCottage && (
                <SummaryRow icon={<Palmtree />} label={selectedCottage.name} />
              )}
            </div>
            <ItemizedBill
              ledger={ledger}
              type={draft.type}
              cottageName={selectedCottage?.name}
              roomExcess={roomExcess}
              total={summaryTotal}
              statutoryPct={state.tariff.statutoryDiscountPct}
              addons={draft.addons}
            />
            <DepositNote amount={ledger.addonDeposit} />
            {selectedCottage && draft.type === "cottage" && (
              <div className="mt-3">
                <Select
                  label={t("booking.summary.rentalHours", { n: cottageCap })}
                  value={String(cottageHours)}
                  onChange={(e) =>
                    dispatch({ type: "DRAFT", payload: { cottageHours: Number(e.target.value) } })
                  }
                >
                  {Array.from({ length: cottageCap }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>
                      {t(h === 1 ? "booking.summary.hour" : "booking.summary.hours", { n: h })}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="mt-4 rounded-xl bg-aqua-50 p-3 text-xs leading-5 text-aqua-900">
              {draft.type === "pool" ? (
                <>
                  <strong>{t("booking.summary.poolLabel")}</strong>{" "}
                  {t("booking.summary.poolBody", { amount: peso(summaryTotal) })}
                </>
              ) : (
                <>
                  <strong>
                    {t("booking.summary.downLabel", { pct: state.settings.downpaymentPct })}
                  </strong>{" "}
                  {t("booking.summary.downBody", {
                    now: peso(requiredNow(draft.type, summaryTotal, state.settings)),
                    balance: peso(
                      summaryTotal -
                        requiredNow(draft.type, summaryTotal, state.settings),
                    ),
                  })}
                </>
              )}
            </div>
            {conflictMsg && !blocked && (
              <p className="mt-3 rounded-xl bg-danger-50 p-3 text-xs font-semibold text-danger-700">
                {conflictMsg}
              </p>
            )}
            <Button
              className="mt-6 w-full"
              disabled={
                !draft.date ||
                !draft.slotId ||
                isPastDate(draft.date) ||
                !hasSupervisor ||
                !!blocked ||
                !!conflictMsg ||
                secondsLeft === 0 ||
                ((draft.type === "cottage" ||
                  draft.type === "room" ||
                  draft.type === "event") &&
                  !draft.cottageId)
              }
              onClick={() => navigate("/checkout?step=waiver")}
            >
              {currentUser ? t("booking.summary.continue") : t("booking.summary.login")}{" "}
              <ArrowRight size={17} />
            </Button>
            <Button
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => navigate("/")}
            >
              {t("booking.summary.back")}
            </Button>
            <p className="mt-3 text-center text-xs text-slate-400">
              {currentUser
                ? t("booking.summary.nextHint")
                : t("booking.summary.browseHint")}
            </p>
          </Card>
        </div>
      </main>
    </PublicLayout>
  )
}

type StepProps = {
  number: string
  title: string
}

function Step({ number, title }: StepProps) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="grid size-8 place-items-center rounded-full bg-aqua-100 text-sm font-extrabold text-aqua-800">
        {number}
      </span>
      <h2 className="text-xl font-extrabold">{title}</h2>
    </div>
  )
}
function Choice({
  selected,
  onClick,
  icon,
  title,
  text,
}: {
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  text: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex gap-4 rounded-2xl border p-4 text-left ${
        selected ? "border-aqua-600 bg-aqua-50 ring-2 ring-aqua-100" : ""
      }`}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-aqua-700">
        {icon}
      </span>
      <span>
        <span className="block font-extrabold">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {text}
        </span>
      </span>
    </button>
  )
}
type SummaryRowProps = {
  icon: React.ReactNode
  label: string
}

function SummaryRow({ icon, label }: SummaryRowProps) {
  return (
    <div className="flex items-center gap-3 text-slate-600">
      <span className="text-aqua-700">{icon}</span>
      <span className="font-semibold">{label}</span>
    </div>
  )
}

function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval)
    return () => window.clearInterval(timer)
  }, [interval])
  return now
}

function HoldCountdown({
  deadline,
  compact = false,
}: {
  deadline: string
  compact?: boolean
}) {
  const { t } = useI18n()
  const now = useNow()
  const ms = new Date(deadline).getTime() - now
  if (ms <= 0) return <Badge tone="danger">{t("booking.hold.expired")}</Badge>
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const warn = ms <= 15 * 60_000
  const clock = `${h ? `${h}h ` : ""}${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`
  if (compact)
    return (
      <Badge tone={warn ? "danger" : "warning"}>
        <Timer size={12} className="mr-1" /> {t("booking.hold.endsIn", { clock })}
      </Badge>
    )
  return (
    <div
      className={`rounded-xl p-4 text-sm ${warn ? "bg-danger-50 text-danger-800" : "bg-warning-50 text-warning-900"}`}
    >
      <p className="flex items-center gap-2 font-extrabold">
        <Timer size={16} /> {t("booking.hold.slotHeld", { clock })}
      </p>
      <p className="mt-1 text-xs leading-5">
        {warn ? t("booking.hold.warn") : t("booking.hold.normal")}
      </p>
    </div>
  )
}

/** Availability / capacity check. Returns a human message when the slot cannot be booked. */
export function findConflict(
  state: AppState,
  draft: DraftBooking,
  ignoreBookingId?: string,
  t: TFn = tEn,
  /** The signed-in guest: their own checkout hold never blocks them. */
  guestId?: string,
  holdId?: string,
): string | null {
  if (isPastDate(draft.date))
    return t("booking.conflict.past")
  if (new Date(`${draft.date}T12:00:00`).getDay() === 2)
    return t("booking.conflict.tuesday")
  const slot = canonicalSlotId(draft.slotId)
  const closure = state.blackouts.find(
    (b) =>
      b.date === draft.date && (!b.slotId || canonicalSlotId(b.slotId) === slot),
  )
  if (closure) return t("booking.conflict.closed", { reason: closure.reason })
  const active = state.bookings.filter(
    (b) =>
      b.id !== ignoreBookingId &&
      b.date === draft.date &&
      canonicalSlotId(b.slotId) === slot &&
      blocksAvailability(b),
  )
  const def = resolveSlot(state.slots, slot)
  const used = active.reduce((sum, b) => sum + b.guests, 0)
  if (def && used + draft.guests > def.capacity)
    return t("booking.conflict.full", { label: def.label, n: Math.max(0, def.capacity - used) })
  const item = draft.cottageId ? state.cottages.find((c) => c.id === draft.cottageId) : undefined
  if (item) {
    const avail = unitAvailability(state, item, draft.date, slot, {
      eventStart: draft.eventStart,
      ignoreBookingId,
      guestId,
      holdId,
    })
    if (avail.left <= 0)
      return avail.blockedBy ?? t("booking.conflict.taken")
  }
  return null
}

export function findDuplicate(
  state: AppState,
  guestId: string | undefined,
  date: string,
  slotId: string,
  ignoreBookingId?: string,
) {
  if (!guestId) return undefined
  const slot = canonicalSlotId(slotId)
  return state.bookings.find(
    (b) =>
      b.id !== ignoreBookingId &&
      b.guestId === guestId &&
      b.date === date &&
      canonicalSlotId(b.slotId) === slot &&
      !["cancelled", "no-show", "completed", "expired"].includes(b.status),
  )
}

export function CheckoutPage() {
  const { t } = useI18n()
  const { state, dispatch, currentUser } = useTampisaw()
  const { ask, dialog } = useConfirm()
  const navigate = useNavigate()
  const catalog = reconcileCatalog(state.cottages)
  const [method, setMethod] = useState<"cash" | "qr">("qr")
  const [proofName, setProofName] = useState("")
  const [proofImage, setProofImage] = useState<string | undefined>()
  const [policyAccepted, setPolicyAccepted] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [arrivalDate, setArrivalDate] = useState("")
  const [arrivalTime, setArrivalTime] = useState("")
  const [params, setParams] = useSearchParams()
  const step: "waiver" | "pay" = params.get("step") === "pay" ? "pay" : "waiver"
  const [waiverForm, setWaiverForm] = useWaiverForm()
  const [showWaiverErrors, setShowWaiverErrors] = useState(false)
  const draft = state.draft
  const { dialog: leaveDialog, allowLeave } = useLeaveGuard(
    draft.guests > 0 || !!proofName || waiverForm.rules.some(Boolean) || Object.keys(waiverForm.health).length > 0,
    undefined,
    undefined,
    ["/book", "/confirmation"],
  )
  useEffect(() => {
    if (currentUser)
      dispatch({
        type: "DRAFT",
        payload: {
          name: currentUser.name,
          email: currentUser.email,
          phone: currentUser.phone,
        },
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id])
  const cottage = catalog.find((item) => item.id === draft.cottageId)
  const { ledger, roomExcess, total } = ledgerOfDraft(state, draft, cottage)
  const minors = mixOfDraft(draft).child
  const waiverGaps = waiverMissing(waiverForm, minors)
  const waiverOk = waiverGaps.length === 0
  const goStep = (next: "waiver" | "pay") => setParams({ step: next })
  // Deep-linking straight to payment without a completed waiver bounces back.
  useEffect(() => {
    if (step === "pay" && !waiverOk) setParams({ step: "waiver" }, { replace: true })
  }, [step, waiverOk, setParams])
  // Partial (down payment) or full payment. Pool entry has no down payment, so it is always paid in full.
  const option: "partial" | "full" = draft.type === "pool" ? "full" : (draft.paymentOption ?? "partial")
  const dueNow = requiredNow(draft.type, total, state.settings, option)
  const balance = Math.max(0, total - dueNow)
  const isFull = option === "full"
  const pct = state.settings.downpaymentPct
  const hoursAway = hoursUntil({ date: draft.date, slotId: draft.slotId })
  const hold = holdHours(state.settings, draft.type, hoursAway)
  // Once the booking is saved the server's copy of it exists, so it must not be reported as a conflict with itself.
  const [saved, setSaved] = useState(false)
  const conflict = saved ? null : findConflict(state, draft, undefined, t, currentUser?.guestId)
  const missingSpace = draft.type !== "pool" && !draft.cottageId
  const arrivalDateError = !arrivalDate
    ? t("checkout.err.arrivalDate")
    : isPastDate(arrivalDate)
      ? t("checkout.err.arrivalPast")
      : new Date(`${arrivalDate}T12:00:00`).getDay() === 2
        ? t("checkout.err.closedTuesday")
        : ""
  const arrivalWindow =
    canonicalSlotId(draft.slotId) === "day-tour"
      ? { min: "08:00", max: "16:00", text: t("checkout.window.day") }
      : canonicalSlotId(draft.slotId) === "room-stay"
        ? { min: "14:00", max: "23:59", text: t("checkout.window.room") }
        : undefined
  const arrivalTimeError = !arrivalTime
    ? t("checkout.err.arrivalTime")
    : arrivalWindow &&
        (arrivalTime < arrivalWindow.min || arrivalTime > arrivalWindow.max)
      ? t("checkout.err.arrivalWindow", { window: arrivalWindow.text })
      : ""
  const cashArrivalError =
    method === "cash" ? arrivalDateError || arrivalTimeError : ""
  const phoneError = !draft.phone.trim()
    ? t("checkout.err.phoneRequired")
    : !isValidPhone(draft.phone)
      ? t("checkout.err.phoneInvalid")
      : ""
  const hoursText = (n: number) =>
    t(n === 1 ? "checkout.hours.one" : "checkout.hours.other", { n })
  const askSubmit = () => {
    const dupe = findDuplicate(state, currentUser?.guestId, draft.date, draft.slotId)
    const slotLabel = resolveSlot(state.slots, draft.slotId)?.label ?? draft.slotId
    ask({
      title: dupe ? t("checkout.confirm.dupeTitle") : t("checkout.confirm.title"),
      confirmLabel: dupe ? t("checkout.confirm.bookAnyway") : t("checkout.confirm.reserveNow"),
      danger: !!dupe,
      body: (
        <div className="grid gap-3">
          {dupe && (
            <p className="rounded-xl bg-danger-50 p-3 font-semibold text-danger-800">
              {t("checkout.confirm.dupeBody", { id: dupe.id })}
            </p>
          )}
          <p>
            {prettyDate(draft.date)}, {slotLabel}
            {draft.type === "event" && draft.eventStart ? ` (${draft.eventStart})` : ""}
            {cottage ? `, ${cottage.name}` : ""}, {t("checkout.guestsCount", { n: draft.guests })}.
          </p>
          <p>
            {method === "qr" ? (
              <>
                {t("checkout.confirm.qrTotal")} <strong>{peso(total)}</strong>.{" "}
                {t("checkout.confirm.qrDue")} <strong>{peso(dueNow)}</strong>{" "}
                {t("checkout.confirm.qrVia")}
                {balance > 0 ? t("checkout.confirm.qrBalance", { amount: peso(balance) }) : ""}.{" "}
                {t("checkout.confirm.qrHold", { hours: hoursText(hold) })}
              </>
            ) : (
              <>
                {t("checkout.confirm.qrTotal")} <strong>{peso(total)}</strong>.{" "}
                {t("checkout.confirm.cashBody", { hours: hoursText(hold) })}
              </>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {t("checkout.confirm.waiverLocked", { hours: state.settings.cancellationHours })}
          </p>
        </div>
      ),
      run: submit,
    })
  }
  const submit = async () => {
    if (
      !currentUser?.guestId ||
      conflict ||
      !waiverOk ||
      isPastDate(draft.date) ||
      phoneError ||
      cashArrivalError
    )
      return
    setProcessing(true)
    let n = 1100 + state.bookings.length
    while (state.bookings.some((b) => b.id === `TMP-${n}`)) n++
    const id = `TMP-${n}`
    const now = new Date()
    const mix = mixOfDraft(draft)
    const waiver = await buildWaiver({
      ...waiverInputOf(waiverForm, minors),
      bookingRef: id,
    })
    const booking: Booking = {
      id,
      guestId: currentUser.guestId!,
      guestName: draft.name,
      email: draft.email,
      date: draft.date,
      slotId: draft.slotId,
      guests: draft.guests,
      type: draft.type,
      cottageId: draft.cottageId,
      cottageHours: draft.type === "cottage" ? draft.cottageHours : undefined,
      status: "pending",
      risk: "medium",
      paid: 0,
      total,
      dueNow,
      paymentOption: option,
      receipt: "none",
      createdAt: now.toISOString(),
      phone: draft.phone,
      adults: mix.adult + mix.senior + mix.pwd,
      children: mix.child,
      discounts: 0,
      mix,
      addons: draft.addons ?? [],
      addonDeposit: ledger.addonDeposit,
      waiver,
      paymentStatus: "unpaid",
      paymentMethod: method,
      paymentDeadline: new Date(now.getTime() + hold * 3_600_000).toISOString(),
      source: "online",
      eventStart: draft.eventStart,
      arrivalDate: method === "cash" ? arrivalDate : undefined,
      arrivalTime: method === "cash" ? arrivalTime : undefined,
    }
    booking.qrToken = await signQrToken(booking)
    // The server has the final say: it re-checks availability, prices the booking and numbers it.
    // Nothing the guest typed or chose is cleared unless this call succeeds: a failed or rejected booking keeps every detail.
    const created = await dispatch({ type: "CREATE_BOOKING", payload: booking })
    if (!created.ok) {
      setProcessing(false)
      return
    }
    setSaved(true)
    const finalId = created.bookingId ?? id
    if (method === "qr" && proofName) await dispatch({ type: "PAYMENT_PROOF", id: finalId, method, proofName, proofImage })
    // Saved: start the next booking from a clean form (the guest's own name, e-mail and phone stay).
    dispatch({
      type: "DRAFT",
      payload: {
        guests: 0,
        adults: 0,
        children: 0,
        discounts: 0,
        type: "pool",
        cottageId: undefined,
        cottageHours: undefined,
        eventStart: "8:00 AM – 12:00 PM",
        mix: undefined,
        addons: [],
        waiver: undefined,
      },
    })
    clearWaiverForm()
    allowLeave()
    navigate(`/confirmation/${finalId}`)
  }
  return (
    <PublicLayout>
      {leaveDialog}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <WizardProgress current={step === "waiver" ? 2 : 3} />
        <PageTitle
          eyebrow={step === "waiver" ? t("checkout.eyebrow.waiver") : t("checkout.eyebrow.pay")}
          title={step === "waiver" ? t("checkout.title.waiver") : t("checkout.title.pay")}
          description={
            step === "waiver"
              ? t("checkout.desc.waiver")
              : isFull
              ? t("checkout.desc.pool")
              : t("checkout.desc.down", { pct })
          }
        />
        <div className="grid items-start gap-7 lg:grid-cols-[1fr_380px]">
          <div className="grid gap-6">
            {conflict && (
              <div className="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-sm text-danger-800">
                <p className="flex items-center gap-2 font-extrabold">
                  <AlertTriangle size={18} /> {t("checkout.conflict.title")}
                </p>
                <p className="mt-1">{conflict}</p>
                <Link to="/book">
                  <Button className="mt-3" variant="secondary">
                    {t("checkout.conflict.cta")} <ArrowRight size={16} />
                  </Button>
                </Link>
              </div>
            )}
            {step === "waiver" && (
              <WaiverStep
                form={waiverForm}
                setForm={setWaiverForm}
                minors={minors}
                showErrors={showWaiverErrors}
              />
            )}
            {step === "pay" && (
            <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-success-50 p-4 text-sm text-success-900">
              <span className="flex items-center gap-2 font-bold">
                <CheckCircle2 size={18} /> {t("checkout.waiverDone")}
              </span>
              <button
                type="button"
                className="font-bold text-aqua-700 underline"
                onClick={() => goStep("waiver")}
              >
                {t("checkout.review")}
              </button>
            </div>
            <Card className="p-6">
              <h2 className="mb-5 text-xl font-extrabold">{t("checkout.contact")}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label={t("checkout.fullName")}
                  value={draft.name}
                  onChange={(e) =>
                    dispatch({
                      type: "DRAFT",
                      payload: { name: lettersOnly(e.target.value) },
                    })
                  }
                />
                <PhoneField
                  label={t("checkout.mobile")}
                  required
                  hint={draft.phone.trim() ? undefined : phoneError}
                  value={draft.phone}
                  onChange={(v) => dispatch({ type: "DRAFT", payload: { phone: v } })}
                />
                <Input
                  label={t("checkout.email")}
                  className="sm:col-span-2"
                  value={draft.email}
                  onChange={(e) =>
                    dispatch({
                      type: "DRAFT",
                      payload: { email: e.target.value },
                    })
                  }
                />
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-extrabold">
                  {isFull ? t("checkout.payFullNow") : t("checkout.downHeading", { pct })}
                </h2>
                {method === "qr" ? (
                  <Badge tone={isFull ? "info" : "warning"}>
                    {t("checkout.dueNowBadge", { amount: peso(dueNow) })}
                  </Badge>
                ) : (
                  <Badge tone="info">{t("checkout.payAtCashier")}</Badge>
                )}
              </div>
              <p className="mb-5 mt-2 text-sm text-slate-500">
                {isFull
                  ? t("checkout.poolNote")
                  : t("checkout.downNote", { due: peso(dueNow), balance: peso(balance) })}
              </p>
              {draft.type !== "pool" && (
                <div className="mb-5" role="radiogroup" aria-label="Payment option">
                  <p className="mb-2 text-sm font-extrabold">Payment option</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Choice
                      selected={option === "partial"}
                      onClick={() => dispatch({ type: "DRAFT", payload: { paymentOption: "partial" } })}
                      icon={<Banknote />}
                      title={`Partial payment (${pct}% down payment)`}
                      text={`Pay ${peso(requiredNow(draft.type, total, state.settings, "partial"))} now, the rest at the resort.`}
                    />
                    <Choice
                      selected={option === "full"}
                      onClick={() => dispatch({ type: "DRAFT", payload: { paymentOption: "full" } })}
                      icon={<CreditCard />}
                      title="Full payment (100%)"
                      text={`Pay the whole ${peso(total)} now. Nothing left to pay later.`}
                    />
                  </div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice
                  selected={method === "cash"}
                  onClick={() => setMethod("cash")}
                  icon={<Smartphone />}
                  title={t("checkout.method.cash")}
                  text={t("checkout.method.cashText")}
                />
                <Choice
                  selected={method === "qr"}
                  onClick={() => setMethod("qr")}
                  icon={<CreditCard />}
                  title={t("checkout.method.qr")}
                  text={t("checkout.method.qrText")}
                />
              </div>
              {method === "cash" && (
                <div className="mt-5 grid gap-4 rounded-xl bg-aqua-50 p-4 sm:grid-cols-2">
                  <p className="text-sm text-slate-600 sm:col-span-2">
                    {t("checkout.cashArrivalHelp")}
                  </p>
                  <Input
                    label={t("checkout.arrivalDate")}
                    type="date"
                    required
                    min={todayLocal()}
                    value={arrivalDate}
                    onChange={(e) => setArrivalDate(e.target.value)}
                    error={arrivalDate ? arrivalDateError : ""}
                  />
                  <Input
                    label={t("checkout.arrivalTime")}
                    type="time"
                    required
                    min={arrivalWindow?.min}
                    max={arrivalWindow?.max}
                    value={arrivalTime}
                    onChange={(e) => setArrivalTime(e.target.value)}
                    error={arrivalTime ? arrivalTimeError : ""}
                  />
                </div>
              )}
              {method === "qr" && (
                <div className="mt-5 grid items-center gap-4 rounded-xl bg-aqua-50 p-4 sm:grid-cols-[auto_1fr]">
                  <PayQr size={200} />
                  <p className="text-sm text-slate-600">
                    {t("checkout.qrHelp1")}{" "}
                    <strong className="text-ink-900">{peso(dueNow)}</strong>
                    {t("checkout.qrHelp2")}
                  </p>
                </div>
              )}
              {method === "qr" && (
              <label className="mt-5 grid gap-2 text-sm font-semibold">
                {t("checkout.uploadProof")}
                <ImageInput
                  onPick={async (f) => {
                    if (!f) {
                      setProofName("")
                      setProofImage(undefined)
                      return
                    }
                    const r = await readProof(f)
                    setProofName(r.name)
                    setProofImage(r.image)
                  }}
                  className="rounded-xl border border-dashed border-aqua-300 bg-aqua-50 p-4 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-aqua-700 file:px-3 file:py-2 file:font-bold file:text-white"
                />
                <span className="text-xs font-normal text-slate-500">
                  {proofName ||
                    t("checkout.proofHelp")}
                </span>
              </label>
              )}
              <div className="mt-5 rounded-xl bg-warning-50 p-4 text-sm text-warning-900">
                <Timer className="mr-2 inline" size={17} />
                <strong>{t("checkout.hold")}</strong> {t("checkout.holdBody")}{" "}
                <strong>{hoursText(hold)}</strong>{" "}
                ({state.settings.peakSeason ? t("checkout.peak") : t("checkout.regular")}
                {hoursAway < 24 ? t("checkout.within24") : ""}). {t("checkout.holdExpire")}
              </div>
              <div className="mt-3 rounded-xl bg-sand-100 p-4 text-sm text-slate-600">
                <ShieldCheck
                  className="mr-2 inline text-success-600"
                  size={18}
                />{" "}
                {t("checkout.simulated")}
              </div>
            </Card>
            </>
            )}
          </div>
          <Card className="min-w-0 p-6 lg:sticky lg:top-24">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold">{t("checkout.summary")}</h2>
              <Link
                to="/book"
                className="flex items-center gap-1 text-xs font-bold text-aqua-700"
              >
                <Edit3 size={14} /> {t("checkout.edit")}
              </Link>
            </div>
            <div className="my-5 grid gap-3 border-y py-5 text-sm">
              <SummaryRow
                icon={<CalendarDays />}
                label={prettyDate(draft.date)}
              />
              <SummaryRow
                icon={<Clock3 />}
                label={
                  draft.type === "event"
                    ? draft.eventStart || t("checkout.chooseBlock")
                    : resolveSlot(state.slots, draft.slotId)?.time || ""
                }
              />
              <SummaryRow icon={<Users />} label={t("checkout.guestsCount", { n: draft.guests })} />
              {cottage && (
                <SummaryRow icon={<Palmtree />} label={cottage.name} />
              )}
            </div>
            <ItemizedBill
              ledger={ledger}
              type={draft.type}
              cottageName={cottage?.name}
              roomExcess={roomExcess}
              total={total}
              statutoryPct={state.tariff.statutoryDiscountPct}
              addons={draft.addons}
            />
            <DepositNote amount={ledger.addonDeposit} />
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between text-base font-extrabold text-aqua-800">
                <span>
                  {method === "cash"
                    ? t("checkout.payAtCashier")
                    : isFull
                      ? t("checkout.payFullNow")
                      : t("checkout.dueNowPct", { pct })}
                </span>
                <span>{peso(dueNow)}</span>
              </div>
              <dl className="grid gap-1.5 rounded-xl border border-slate-200 p-3 text-xs" aria-label="Payment summary">
                {(
                  [
                    ["Total booking amount", peso(total)],
                    ["Payment option", isFull ? "Full payment (100%)" : "Partial payment (down payment)"],
                    ["Required down-payment", isFull ? "Not applicable" : `${pct}%`],
                    ["Amount to pay", peso(dueNow)],
                    ["Amount already paid", peso(0)],
                    ["Remaining balance after this payment", peso(balance)],
                    ["Payment method", method === "cash" ? "Cash (at the cashier)" : "E-Wallet (GCash QR)"],
                    ["Payment status", "Pending"],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="text-right font-bold text-ink-900">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="rounded-lg bg-aqua-50 p-3 text-xs leading-5 text-aqua-900">
                {method === "cash"
                  ? t("checkout.statusCash")
                  : isFull
                  ? t("checkout.statusFull")
                  : t("checkout.statusDown")}
              </p>
            </div>
            {step === "waiver" ? (
              <>
                {showWaiverErrors && !waiverOk && (
                  <p className="mt-5 text-xs font-semibold text-danger-700">
                    {t("checkout.completeItems")}
                  </p>
                )}
                <Button
                  className="mt-6 w-full"
                  onClick={() => {
                    if (!waiverOk) {
                      setShowWaiverErrors(true)
                      return
                    }
                    goStep("pay")
                  }}
                >
                  {t("checkout.continuePay")} <ArrowRight size={17} />
                </Button>
                <Button
                  variant="ghost"
                  className="mt-2 w-full"
                  onClick={() => navigate("/book")}
                >
                  {t("checkout.backDetails")}
                </Button>
              </>
            ) : (
              <>
            <label className="mt-5 flex gap-3 rounded-xl bg-sand-100 p-4 text-xs leading-5 text-slate-600">
              <input
                type="checkbox"
                checked={policyAccepted}
                onChange={(event) => setPolicyAccepted(event.target.checked)}
                className="mt-1"
              />
              <span>
                <strong className="block text-ink-900">
                  {t("checkout.policyTitle")}
                </strong>
                {t("checkout.policyBody", { hours: state.settings.cancellationHours })}
              </span>
            </label>
            <Button
              className="mt-6 w-full"
              loading={processing}
              disabled={
                processing ||
                !!conflict ||
                missingSpace ||
                total <= 0 ||
                !draft.name ||
                !draft.email ||
                !!phoneError ||
                !!cashArrivalError ||
                (method === "qr" && !proofName) ||
                !policyAccepted
              }
              onClick={askSubmit}
            >
              {processing
                ? t("checkout.securing")
                : method === "qr"
                  ? t("checkout.submitQr", { amount: peso(dueNow) })
                  : t("checkout.reserveCashier")}{" "}
              {!processing && <ArrowRight size={17} />}
            </Button>
            <Button
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => goStep("waiver")}
            >
              {t("checkout.backWaiver")}
            </Button>
            <p className="mt-3 text-center text-xs text-slate-400">
              {t("checkout.cashOrQr")}
            </p>
            {(phoneError || cashArrivalError) && (
              <p className="mt-2 text-center text-xs font-semibold text-danger-700">
                {phoneError || cashArrivalError}
              </p>
            )}
              </>
            )}
          </Card>
        </div>
        {dialog}
      </main>
    </PublicLayout>
  )
}

const receiptState = (b: Booking) =>
  b.receipt === "official"
    ? "official"
    : b.receipt === "reserved"
      ? "reserved"
      : "none"

/** Itemized bill for a stored booking; legacy bookings fall back to a single total. */
function BookingBill({ booking }: { booking: Booking }) {
  const { t } = useI18n()
  const { state } = useTampisaw()
  const cottage = reconcileCatalog(state.cottages).find(
    (c) => c.id === booking.cottageId,
  )
  const l = ledgerOfBooking(state, booking, cottage)
  return (
    <div className="min-w-0">
      {l ? (
        <ItemizedBill
          ledger={l.ledger}
          type={booking.type}
          cottageName={cottage?.name}
          roomExcess={l.roomExcess}
          total={booking.total}
          statutoryPct={state.tariff.statutoryDiscountPct}
          addons={booking.addons}
        />
      ) : (
        <div className="flex justify-between gap-3 text-sm font-bold">
          <span>{t("confirm.totalBooking")}</span>
          <span>{peso(booking.total)}</span>
        </div>
      )}
      <DepositNote amount={booking.addonDeposit ?? 0} />
    </div>
  )
}

function ReceiptPanel({ booking }: { booking: Booking }) {
  const { t } = useI18n()
  const rs = receiptState(booking)
  const balance = balanceOf(booking)
  if (rs === "none")
    return (
      <div className="rounded-xl bg-warning-50 p-4 text-sm text-warning-900">
        <p className="flex items-center gap-2 font-extrabold">
          <Receipt size={16} /> {t("confirm.receiptPending")}
        </p>
        <p className="mt-1 text-xs leading-5">
          {booking.paymentStatus === "submitted"
            ? t("confirm.receiptSubmitted")
            : booking.paymentStatus === "rejected"
              ? t("confirm.receiptRejected")
              : t("confirm.receiptNone")}
        </p>
      </div>
    )
  return (
    <div
      className={`rounded-xl p-4 text-sm ${rs === "official" ? "bg-success-50 text-success-900" : "bg-sky-50 text-sky-900"}`}
    >
      <p className="flex items-center gap-2 font-extrabold">
        <Receipt size={16} />{" "}
        {rs === "official" ? t("confirm.receiptOfficial") : t("confirm.receiptReserved")}
      </p>
      <p className="mt-1 text-xs leading-5">
        {rs === "official"
          ? t("confirm.paidFull", { amount: peso(booking.paid) })
          : t("confirm.downReceived", { paid: peso(booking.paid), balance: peso(balance) })}
      </p>
    </div>
  )
}

export function ConfirmationPage() {
  const { t } = useI18n()
  const { bookingId } = useParams()
  const { state, dispatch, currentUser } = useTampisaw()
  const catalog = reconcileCatalog(state.cottages)
  const booking = state.bookings.find(
    (item) =>
      item.id === bookingId && item.guestId === currentUser?.guestId,
  )
  // Keep the QR payload a signed SHA-256 token; re-sign if missing or the booking moved.
  useEffect(() => {
    if (!booking) return
    let cancelled = false
    signQrToken(booking).then((token) => {
      if (!cancelled && token !== booking.qrToken)
        dispatch({ type: "SET_QR_TOKEN", id: booking.id, token })
    })
    return () => {
      cancelled = true
    }
  }, [booking?.id, booking?.date, booking?.slotId, booking?.guests, booking?.qrToken, dispatch]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!booking)
    return (
      <PublicLayout>
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="text-2xl font-extrabold">{t("confirm.notFound")}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {t("confirm.notFoundBody")}
          </p>
          <Link to="/my-bookings">
            <Button className="mt-6">{t("confirm.goMyBookings")}</Button>
          </Link>
        </main>
      </PublicLayout>
    )
  const slot = resolveSlot(state.slots, booking.slotId)
  const cottage = catalog.find((item) => item.id === booking.cottageId)
  const awaitingProof =
    booking.status === "pending" &&
    (booking.paymentStatus === "unpaid" || booking.paymentStatus === "rejected")
  const awaitingVerify =
    booking.status === "pending" && booking.paymentStatus === "submitted"
  const dead = ["expired", "cancelled", "no-show"].includes(booking.status)
  const pending = booking.status === "pending"
  const headline = dead
    ? booking.status === "expired"
      ? t("confirm.head.expired")
      : t("confirm.head.dead", {
          status: t(`mybookings.status.${booking.status}` as TKey),
        })
    : awaitingVerify
      ? t("confirm.head.verify")
      : awaitingProof
        ? booking.paymentStatus === "rejected"
          ? t("confirm.head.rejected")
          : t("confirm.head.awaiting")
        : booking.status === "reserved"
          ? t("confirm.head.reserved")
          : t("confirm.head.confirmed")
  const title = dead
    ? t("confirm.title.dead")
    : awaitingVerify
      ? t("confirm.title.verify")
      : awaitingProof
        ? t("confirm.title.awaiting")
        : booking.status === "reserved"
          ? t("confirm.title.reserved")
          : t("confirm.title.confirmed")
  return (
    <PublicLayout>
      <main id="ticket-print" className="mx-auto w-full min-w-0 max-w-3xl overflow-x-hidden px-3 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 text-center">
          <span
            className={`mx-auto grid size-18 place-items-center rounded-full ${
              dead
                ? "bg-danger-100 text-danger-700"
                : pending
                  ? "bg-warning-100 text-warning-700"
                  : "bg-success-100 text-success-700"
            }`}
          >
            {pending ? <Clock3 size={38} /> : <CheckCircle2 size={38} />}
          </span>
          <p
            className={`mt-5 text-xs font-extrabold uppercase tracking-[0.2em] ${
              dead
                ? "text-danger-700"
                : pending
                  ? "text-warning-700"
                  : "text-success-700"
            }`}
          >
            {headline}
          </p>
          <h1 className="mt-2 break-words text-2xl font-extrabold sm:text-4xl">{title}</h1>
          <p className="mt-2 break-all text-slate-500 sm:break-words">
            {t("confirm.sentTo", { email: booking.email })}
          </p>
        </div>
        {pending && booking.paymentDeadline && (
          <div className="mb-5">
            <HoldCountdown deadline={booking.paymentDeadline} />
          </div>
        )}
        <Card className="max-w-full overflow-hidden bg-aqua-50 p-3 sm:p-7">
          <div className="mb-5 text-center">
            <img loading="lazy" decoding="async"
              src="/golden-pyramid/logo.jpg"
              alt=""
              className="mx-auto mb-3 size-14 rounded-2xl object-contain shadow-sm"
            />
            <p className="text-xl font-extrabold text-aqua-800">
              Golden Pyramid Swimming Pool
            </p>
            <p className="mt-1 text-xs text-slate-500">
              California Village, Quezon City
            </p>
          </div>
          <div className="min-w-0 rounded-2xl border-2 border-dashed border-aqua-200 bg-white p-4 text-center shadow-sm sm:p-7">
            <GuestStatusBadge status={booking.status} />
            <div
              className={`mx-auto mt-5 w-fit max-w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-inner ${dead ? "opacity-30" : ""}`}
            >
              {booking.qrToken ? (
                <QRCodeSVG
                  value={booking.qrToken}
                  size={176}
                  level="M"
                  className="h-auto max-w-full"
                  style={{ width: "min(176px, 100%)", height: "auto" }}
                  imageSettings={{
                    src: "/golden-pyramid/logo.jpg",
                    height: 32,
                    width: 32,
                    excavate: true,
                  }}
                />
              ) : (
                <div className="grid size-44 max-w-full place-items-center text-xs text-slate-400">
                  {t("confirm.signing")}
                </div>
              )}
            </div>
            <p className="mt-4 inline-flex max-w-full break-all rounded-lg bg-aqua-50 px-3 py-2 font-mono text-sm font-bold tracking-wider text-aqua-800">
              {booking.id}
            </p>
            {booking.qrToken && (
              <p className="mx-auto mt-2 max-w-full break-all rounded-lg bg-slate-50 px-3 py-2 text-left font-mono text-xs leading-4 text-slate-500">
                <span className="font-sans font-bold text-slate-600">
                  {t("confirm.signedToken")}{" "}
                </span>
                {booking.qrToken}
              </p>
            )}
            {pending && (
              <p className="mt-2 text-xs text-slate-500">
                {t("confirm.passValid")}
              </p>
            )}
            <div className="mt-6 grid gap-5 border-t border-slate-100 pt-5 text-left sm:grid-cols-2">
              <TicketDetail label={t("confirm.guestName")} value={booking.guestName} />
              {arrivalLabel(booking) && (
                <TicketDetail label={t("confirm.arrival")} value={arrivalLabel(booking)!} />
              )}
              {booking.mix && (
                <TicketDetail
                  label={t("confirm.guestTypes")}
                  value={(Object.keys(booking.mix) as (keyof GuestMix)[])
                    .filter((k) => booking.mix![k] > 0)
                    .map((k) => `${booking.mix![k]} ${kindLabel[k].toLowerCase()}`)
                    .join(", ")}
                />
              )}
              {!!booking.addons?.length && (
                <TicketDetail
                  label={t("confirm.addons")}
                  value={booking.addons.map((a) => `${a.name} × ${a.qty}`).join(", ")}
                />
              )}
              <TicketDetail
                label={t("confirm.reservedSpace")}
                value={cottage?.name || t("confirm.poolEntry")}
              />
              <TicketDetail
                label={t("confirm.dateSlot")}
                value={`${prettyDate(booking.date)} · ${booking.eventStart || slot?.time || ""}`}
              />
              <TicketDetail
                label={t("confirm.totalParty")}
                value={t(booking.guests === 1 ? "confirm.guest.one" : "confirm.guest.other", { n: booking.guests })}
              />
              {booking.timeIn && (
                <TicketDetail
                  label={t("confirm.timeIn")}
                  value={prettyDateTime(booking.timeIn)}
                />
              )}
              {booking.timeOut && (
                <TicketDetail
                  label={t("confirm.timeOut")}
                  value={prettyDateTime(booking.timeOut)}
                />
              )}
            </div>
          </div>
          <div className="mt-5 grid gap-4">
            <div className="min-w-0 rounded-xl bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-extrabold">{t("confirm.itemized")}</p>
              <BookingBill booking={booking} />
            </div>
            <ReceiptPanel booking={booking} />
            <WaiverRecord waiver={booking.waiver} />
          </div>
          <div className="mt-5 rounded-xl bg-sand-100 p-4 text-sm leading-6 text-slate-600">
            {booking.type === "event" ? (
              <>
                <strong className="text-ink-900">{t("confirm.eventReminder")}</strong>{" "}
                {t("confirm.eventBody")}
              </>
            ) : (
              <>
                <strong className="text-ink-900">{t("confirm.poolRules")}</strong>{" "}
                {t("confirm.poolRulesBody")}
              </>
            )}
          </div>
          <div className="mt-6 border-t border-slate-200 pt-6 sm:flex sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-bold">
                {t("confirm.paidSoFar", { amount: peso(booking.paid) })}
                {pending && booking.dueNow
                  ? ` · ${t("confirm.dueNow", { amount: peso(booking.dueNow) })}`
                  : ""}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {t("confirm.balancePending", { amount: peso(balanceOf(booking)) })}
                {balanceOf(booking) > 0 && booking.type !== "pool"
                  ? ` ${t("confirm.balanceHint")}`
                  : ""}
              </p>
            </div>
            <Button
              variant="secondary"
              className="mt-4 w-full sm:mt-0 sm:w-auto"
              onClick={() => window.print()}
            >
              <Download size={17} /> {t("confirm.saveToPhone")}
            </Button>
          </div>
        </Card>
        {!dead && <TicketTools booking={booking} spaceName={cottage?.name} />}
        <div className="no-print mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/my-bookings">
            <Button className="w-full">
              {awaitingProof ? t("confirm.uploadManage") : t("confirm.viewMyBookings")}
            </Button>
          </Link>
          <Link to="/">
            <Button variant="secondary" className="w-full">
              {t("confirm.backHome")}
            </Button>
          </Link>
        </div>
      </main>
    </PublicLayout>
  )
}

function GuestStatusBadge({ status }: { status: Booking["status"] }) {
  const { t } = useI18n()
  const tone =
    status === "checked-in" || status === "completed"
      ? "success"
      : status === "cancelled" || status === "no-show"
        ? "danger"
        : status === "pending"
          ? "warning"
          : "info"
  return <Badge tone={tone}>{t(`mybookings.status.${status}` as TKey)}</Badge>
}

function TicketDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-extrabold text-ink-900">{value}</p>
    </div>
  )
}

type HubTab = "upcoming" | "past" | "payments"
const pastStatuses = [
  "checked-out",
  "completed",
  "cancelled",
  "expired",
  "no-show",
]

export function MyBookingsPage() {
  const { t } = useI18n()
  const { state, dispatch, currentUser } = useTampisaw()
  const { ask, dialog } = useConfirm()
  const catalog = reconcileCatalog(state.cottages)
  const settings = state.settings
  const [tab, setTab] = useState<HubTab>("upcoming")
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [balanceId, setBalanceId] = useState<string | null>(null)
  const [proofId, setProofId] = useState<string | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const proofMethod = "qr" as const
  const [proofFile, setProofFile] = useState("")
  const [proofImg, setProofImg] = useState<string | undefined>()
  const [flash, setFlash] = useState("")
  const exitFlash = useExit(flash)
  const guestId = currentUser?.guestId
  const mine = useMemo(
    () => state.bookings.filter((b) => !!guestId && b.guestId === guestId),
    [state.bookings, guestId],
  )
  const myIds = mine.map((b) => b.id)
  const noteState = useNotices()
  const myNotices = state.notices
    .filter((n) => n.audience === "guest" && n.guestId === guestId)
    .slice(0, 10)
  const myRefunds = state.refunds.filter((r) => myIds.includes(r.bookingId))
  const upcoming = mine.filter((b) => !pastStatuses.includes(b.status))
  const past = mine.filter((b) => pastStatuses.includes(b.status))
  const shown = tab === "upcoming" ? upcoming : past
  const byId = (id: string | null) => mine.find((b) => b.id === id)
  const cancelTarget = byId(cancelId)
  const balanceTarget = byId(balanceId)
  const proofTarget = byId(proofId)
  const receiptTarget = byId(receiptId)
  const actor = currentUser?.name ?? "Guest"
  const openBalance = (id: string) => {
    setProofFile("")
    setProofImg(undefined)
    setBalanceId(id)
  }

  const tabBtn = (id: HubTab, label: string, count?: number) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`whitespace-nowrap px-4 py-3 text-sm font-bold ${
        tab === id
          ? "border-b-2 border-aqua-600 text-aqua-700"
          : "text-slate-500"
      }`}
    >
      {label}
      {count ? (
        <span className="ml-2 rounded-full bg-aqua-100 px-2 py-0.5 text-xs text-aqua-800">
          {count}
        </span>
      ) : null}
    </button>
  )

  const pendingBalances = mine.filter(
    (b) =>
      ["reserved", "confirmed", "checked-in"].includes(b.status) &&
      balanceOf(b) > 0,
  )
  const awaitingPayment = mine.filter((b) => b.status === "pending")
  const receipts = mine.filter((b) => receiptState(b) !== "none")
  const cancelRequests = mine.filter(
    (b) => b.status === "cancellation-requested",
  )

  const renderCard = (booking: Booking) => {
    const slot = resolveSlot(state.slots, booking.slotId)
    const cottage = catalog.find((item) => item.id === booking.cottageId)
    const away = hoursUntil(booking)
    const live = !pastStatuses.includes(booking.status)
    const canCancel =
      live &&
      ["pending", "reserved", "confirmed"].includes(booking.status) &&
      away > 0
    const balance = balanceOf(booking)
    const needsProof =
      booking.status === "pending" &&
      (booking.paymentStatus === "unpaid" ||
        booking.paymentStatus === "rejected")
    const hasWindow = needsConfirmation(booking, settings)
    const confirmable =
      hasWindow &&
      !booking.attendanceConfirmed &&
      ["reserved", "confirmed"].includes(booking.status) &&
      away > 0 &&
      away <= settings.confirmationHours
    const reached =
      booking.status === "checked-out" || booking.status === "completed"
        ? 3
        : booking.status === "checked-in"
          ? 2
          : booking.status === "reserved" || booking.status === "confirmed"
            ? 1
            : 0
    const showSteps = [
      "pending",
      "reserved",
      "confirmed",
      "checked-in",
      "checked-out",
      "completed",
    ].includes(booking.status)
    return (
      <Card key={booking.id} className="overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
          <Link
            to={`/confirmation/${booking.id}`}
            aria-label={t("mybookings.viewTicketAria")}
            className="grid size-18 shrink-0 place-items-center rounded-2xl bg-aqua-50 text-aqua-700 transition hover:bg-aqua-100"
          >
            <QrCode size={30} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold">
                {prettyDate(booking.date)}
              </h2>
              <GuestStatusBadge status={booking.status} />
              {receiptState(booking) !== "none" && (
                <Badge tone={receiptState(booking) === "official" ? "success" : "info"}>
                  {receiptState(booking) === "official"
                    ? t("mybookings.officialReceipt")
                    : t("mybookings.reservedReceipt")}
                </Badge>
              )}
              {booking.attendanceConfirmed && live && (
                <Badge tone="success">{t("mybookings.attendanceConfirmed")}</Badge>
              )}
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              {booking.eventStart || slot?.time} · {t("checkout.guestsCount", { n: booking.guests })} ·{" "}
              {cottage?.name || t("confirm.poolEntry")}
            </p>
            {arrivalLabel(booking) && (
              <p className="mt-1 text-xs font-semibold text-slate-600">
                {t("mybookings.arrivalLabel", { value: arrivalLabel(booking) ?? "" })}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              {booking.id} · {t("mybookings.paymentLine", {
                status: t(`mybookings.pay.${booking.paymentStatus}` as TKey),
                paid: peso(booking.paid),
                total: peso(booking.total),
              })}
            </p>
            {booking.status === "pending" && booking.paymentDeadline && (
              <div className="mt-3">
                <HoldCountdown deadline={booking.paymentDeadline} compact />
                {booking.paymentStatus === "submitted" && (
                  <p className="mt-2 text-xs font-semibold text-warning-800">
                    {t("mybookings.waitingVerify")}
                  </p>
                )}
                {booking.paymentStatus === "rejected" && (
                  <p className="mt-2 text-xs font-semibold text-danger-700">
                    {t("mybookings.rejectedHold")}
                  </p>
                )}
              </div>
            )}
            {balance > 0 && booking.status !== "pending" && live && (
              <p className="mt-3 text-sm font-bold text-warning-800">
                {t("confirm.balancePending", { amount: peso(balance) })}
              </p>
            )}
            {showSteps && (
              <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-500">
                {[
                  t("mybookings.step.pending"),
                  booking.status === "reserved" ? t("mybookings.step.reserved") : t("mybookings.step.confirmed"),
                  t("mybookings.step.checkedIn"),
                  t("mybookings.step.checkedOut"),
                ].map((step, index) => (
                  <span key={step} className="flex flex-1 items-center gap-2">
                    <span
                      className={`grid size-5 shrink-0 place-items-center rounded-full ${
                        index <= reached
                          ? "bg-aqua-600 text-white"
                          : "bg-slate-200"
                      }`}
                    >
                      {index < reached ? <Check size={11} /> : index + 1}
                    </span>
                    <span className={index <= reached ? "text-ink-900" : ""}>
                      {step}
                    </span>
                  </span>
                ))}
              </div>
            )}
            <details className="mt-4 rounded-xl border p-3 text-sm">
              <summary className="cursor-pointer font-bold text-aqua-800">
                {t("mybookings.details")}
              </summary>
              <div className="mt-3 grid gap-4">
                <BookingBill booking={booking} />
                <WaiverRecord waiver={booking.waiver} />
                {!booking.waiver && (
                  <p className="text-xs text-slate-500">
                    {t("mybookings.legacyWaiver")}
                  </p>
                )}
              </div>
            </details>
            {(booking.timeIn || booking.timeOut) && (
              <div className="mt-4 grid gap-2 rounded-xl bg-sand-100 p-3 text-xs sm:grid-cols-2">
                <p>
                  <span className="font-bold text-slate-500">
                    {t("mybookings.braceletIn")}
                  </span>{" "}
                  <strong>
                    {booking.timeIn ? prettyDateTime(booking.timeIn) : t("mybookings.notYet")}
                  </strong>
                </p>
                <p>
                  <span className="font-bold text-slate-500">
                    {t("mybookings.braceletOut")}
                  </span>{" "}
                  <strong>
                    {booking.timeOut
                      ? prettyDateTime(booking.timeOut)
                      : t("mybookings.stillInside")}
                  </strong>
                </p>
              </div>
            )}
            {booking.status === "cancellation-requested" && (
              <p className="mt-3 rounded-xl bg-warning-50 p-3 text-xs font-semibold text-warning-800">
                {t("mybookings.cancelRequestedNote")}
              </p>
            )}
            {confirmable && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-aqua-50 p-3">
                <p className="flex-1 text-xs font-semibold text-aqua-900">
                  {t("mybookings.confirmPrompt", { hours: settings.confirmationHours })}
                </p>
                <Button
                  onClick={() =>
                    ask({
                      title: t("mybookings.confirmAttendanceTitle"),
                      confirmLabel: t("mybookings.confirmAttendanceYes"),
                      body: t("mybookings.confirmAttendanceBody", {
                        id: booking.id,
                        date: prettyDate(booking.date),
                        slot: resolveSlot(state.slots, booking.slotId)?.label ?? booking.slotId,
                        guests: t("checkout.guestsCount", { n: booking.guests }),
                      }),
                      run: () => {
                        dispatch({ type: "CONFIRM_ATTENDANCE", id: booking.id })
                        setFlash(t("mybookings.attendanceFlash", { id: booking.id }))
                      },
                    })
                  }
                >
                  <CheckCircle2 size={16} /> {t("mybookings.confirmAttendance")}
                </Button>
              </div>
            )}
            {live &&
              ["reserved", "confirmed"].includes(booking.status) &&
              !booking.attendanceConfirmed &&
              !confirmable &&
              away > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  {hasWindow
                    ? t("mybookings.confirmOpens", { hours: settings.confirmationHours })
                    : t("mybookings.confirmNotNeeded", { hours: settings.confirmationHours })}
                </p>
              )}
          </div>
          <div className="flex flex-wrap gap-2 sm:w-44 sm:flex-col">
            {needsProof && (
              <Button
                onClick={() => {
                  setProofId(booking.id)
                  setProofFile("")
                  setProofImg(undefined)
                }}
              >
                <Upload size={16} /> {t("mybookings.uploadProof")}
              </Button>
            )}
            {balance > 0 &&
              ["reserved", "confirmed", "checked-in"].includes(
                booking.status,
              ) && (
                <Button onClick={() => openBalance(booking.id)}>
                  <Wallet size={16} /> {t("mybookings.payBalance")}
                </Button>
              )}
            {receiptState(booking) !== "none" && (
              <Button
                variant="secondary"
                onClick={() => setReceiptId(booking.id)}
              >
                <Receipt size={16} /> {t("mybookings.receipt")}
              </Button>
            )}
            {live && canCancel && (
              <RescheduleButton
                booking={booking}
                actor={actor}
                onDone={(message) => setFlash(message)}
              />
            )}
            <Link to={`/confirmation/${booking.id}`}>
              <Button variant="secondary" className="w-full">
                <QrCode size={16} /> {t("mybookings.ticketQr")}
              </Button>
            </Link>
            {canCancel && (
              <Button
                variant="ghost"
                className="text-danger-600"
                onClick={() => setCancelId(booking.id)}
              >
                {t("mybookings.cancel")}
              </Button>
            )}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <PublicLayout>
      <main className="mx-auto max-w-6xl px-4 py-9 sm:px-6 lg:px-8">
        <PageTitle
          eyebrow={t("mybookings.welcome", { name: currentUser?.name.split(" ")[0] ?? t("mybookings.guestFallback") })}
          title={t("mybookings.title")}
          description={t("mybookings.desc")}
          action={
            <div className="flex flex-wrap gap-2">
              <Link to="/help">
                <Button variant="secondary">
                  <AlertTriangle size={16} /> {t("mybookings.reportIncident")}
                </Button>
              </Link>
              <Link to="/help">
                <Button variant="secondary">
                  <Wrench size={16} /> {t("mybookings.callMaintenance")}
                </Button>
              </Link>
              <Link to="/book">
                <Button>
                  {t("mybookings.bookAnother")} <Plus size={17} />
                </Button>
              </Link>
            </div>
          }
        />
        {exitFlash.value && (
          <p
            role="status"
            className={`${exitFlash.leaving ? "animate-slide-out" : "animate-slide-in"} mb-5 flex items-center justify-between rounded-xl bg-success-50 p-3 text-sm font-bold text-success-800`}
          >
            {exitFlash.value}
            <button onClick={() => setFlash("")} aria-label={t("mybookings.dismiss")}>
              <X size={16} />
            </button>
          </p>
        )}
        <div className="grid items-start gap-7 lg:grid-cols-[1fr_320px]">
          <div>
            <MyWaitlist />
            <div className="mb-6 flex gap-1 overflow-x-auto border-b">
              {tabBtn("upcoming", t("mybookings.tab.upcoming"), upcoming.length)}
              {tabBtn("past", t("mybookings.tab.past"))}
              {tabBtn(
                "payments",
                t("mybookings.tab.payments"),
                pendingBalances.length + awaitingPayment.length,
              )}
            </div>
            {tab !== "payments" ? (
              <div className="grid gap-5">
                {shown.map(renderCard)}
                {!shown.length && (
                  <Card className="p-6 sm:p-10 text-center">
                    <Coffee className="mx-auto text-aqua-600" size={34} />
                    <h2 className="mt-4 text-xl font-extrabold">
                      {t("mybookings.empty.title")}
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      {tab === "upcoming" ? t("mybookings.empty.upcoming") : t("mybookings.empty.past")}
                    </p>
                  </Card>
                )}
              </div>
            ) : (
              <div className="grid gap-6">
                <Card className="p-5 sm:p-6">
                  <h2 className="text-lg font-extrabold">{t("mybookings.pendingPayments")}</h2>
                  <div className="mt-4 grid gap-3">
                    {awaitingPayment.map((b) => (
                      <div
                        key={b.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warning-50 p-4 text-sm"
                      >
                        <div>
                          <p className="font-extrabold">
                            {b.paymentMethod === "cash"
                              ? `${b.id} · ${t("mybookings.payAtCashierLower")}`
                              : `${b.id} · ${t("mybookings.dueNowLower", { amount: peso(b.dueNow ?? b.total) })}`}
                          </p>
                          <p className="text-xs text-warning-900">
                            {b.paymentStatus === "submitted"
                              ? t("confirm.receiptSubmitted")
                              : b.paymentMethod === "cash"
                                ? t("mybookings.cashPending")
                                : t("mybookings.uploadOrCashier")}
                          </p>
                          {b.paymentDeadline && (
                            <div className="mt-2">
                              <HoldCountdown
                                deadline={b.paymentDeadline}
                                compact
                              />
                            </div>
                          )}
                        </div>
                        {b.paymentStatus !== "submitted" && (
                          <Button
                            onClick={() => {
                              setProofId(b.id)
                              setProofFile("")
                              setProofImg(undefined)
                            }}
                          >
                            <Upload size={16} /> {t("mybookings.uploadProof")}
                          </Button>
                        )}
                      </div>
                    ))}
                    {pendingBalances.map((b) => (
                      <div
                        key={b.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sky-50 p-4 text-sm"
                      >
                        <div>
                          <p className="font-extrabold">
                            {t("mybookings.balanceLine", { id: b.id, amount: peso(balanceOf(b)) })}
                          </p>
                          <p className="text-xs text-sky-900">
                            {t("mybookings.balanceHelp", { paid: peso(b.paid), total: peso(b.total) })}
                          </p>
                        </div>
                        <Button onClick={() => openBalance(b.id)}>
                          <Wallet size={16} /> {b.balanceProof?.status === "submitted" ? t("mybookings.proofSent") : t("mybookings.payBalanceOnline")}
                        </Button>
                      </div>
                    ))}
                    {!awaitingPayment.length && !pendingBalances.length && (
                      <p className="text-sm text-slate-500">
                        {t("mybookings.allPaid")}
                      </p>
                    )}
                  </div>
                </Card>
                <Card className="p-5 sm:p-6">
                  <h2 className="text-lg font-extrabold">{t("mybookings.receipts")}</h2>
                  <div className="mt-4 grid gap-3">
                    {receipts.map((b) => (
                      <div
                        key={b.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"
                      >
                        <div>
                          <p className="font-extrabold">
                            {receiptState(b) === "official"
                              ? t("confirm.receiptOfficial")
                              : t("confirm.receiptReserved")}{" "}
                            · {b.id}
                          </p>
                          <p className="text-xs text-slate-500">
                            {t("mybookings.paidBalance", { paid: peso(b.paid), balance: peso(balanceOf(b)) })}
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          onClick={() => setReceiptId(b.id)}
                        >
                          <Printer size={16} /> {t("mybookings.viewPrint")}
                        </Button>
                      </div>
                    ))}
                    {!receipts.length && (
                      <p className="text-sm text-slate-500">
                        {t("mybookings.noReceipts")}
                      </p>
                    )}
                  </div>
                </Card>
                <Card className="p-5 sm:p-6">
                  <h2 className="text-lg font-extrabold">
                    {t("mybookings.refundsDeposits")}
                  </h2>
                  <div className="mt-4 grid gap-3">
                    {cancelRequests.map((b) => (
                      <div
                        key={b.id}
                        className="rounded-xl bg-warning-50 p-4 text-sm text-warning-900"
                      >
                        <p className="font-extrabold">{b.id} · {t("mybookings.cancelRequestedLower")}</p>
                        <p className="text-xs">
                          {t("mybookings.waitingReceptionist", { amount: peso(b.paid) })}
                        </p>
                      </div>
                    ))}
                    {myRefunds.map((r) => (
                      <div
                        key={r.id}
                        className={`rounded-xl p-4 text-sm ${r.kind === "refund" ? "bg-success-50 text-success-900" : "bg-slate-100 text-slate-700"}`}
                      >
                        <p className="font-extrabold">
                          {r.bookingId} ·{" "}
                          {r.kind === "refund"
                            ? t("mybookings.refundAmount", { amount: peso(r.amount) })
                            : t("mybookings.depositKept", { amount: peso(r.amount) })}
                        </p>
                        <p className="text-xs">
                          {r.kind === "refund"
                            ? t("mybookings.refundAvail")
                            : t("mybookings.lateAvail")}{" "}
                          {t("mybookings.processed", { at: prettyDateTime(r.at) })} {r.reason}
                        </p>
                      </div>
                    ))}
                    {!cancelRequests.length && !myRefunds.length && (
                      <p className="text-sm text-slate-500">
                        {t("mybookings.noRefunds")}
                      </p>
                    )}
                  </div>
                </Card>
              </div>
            )}
          </div>
          <Card className="p-5 lg:sticky lg:top-24">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Bell size={18} className="text-aqua-700" /> {t("mybookings.notifications")}
              {noteState.unread.length > 0 && (
                <span className="rounded-full bg-danger-500 px-2 py-0.5 text-xs font-extrabold text-white">{noteState.unread.length} new</span>
              )}
              {noteState.unread.length > 0 && (
                <button type="button" onClick={noteState.markAllRead} className="ml-auto text-xs font-bold text-aqua-700">Mark all read</button>
              )}
            </h2>
            <div className="mt-4 grid gap-3">
              {myNotices.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => noteState.markRead(n.id)}
                  className={`rounded-xl p-3 text-left ${noteState.isRead(n.id) ? "bg-sand-100" : "border-l-4 border-aqua-600 bg-aqua-50"}`}
                >
                  <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${noticeKind(n).tone}`}>{noticeKind(n).label}</span>
                  <p className={`text-sm leading-5 ${noteState.isRead(n.id) ? "text-slate-600" : "font-semibold text-ink-900"}`}>{n.message}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    {prettyDateTime(n.at)}
                  </p>
                </button>
              ))}
              {!myNotices.length && (
                <p className="text-sm text-slate-500">
                  {t("mybookings.caughtUp")}
                </p>
              )}
              <p className="text-xs text-slate-400">{t("mybookings.simNotice")}</p>
            </div>
          </Card>
        </div>

        <ConfirmDialog
          danger
          open={!!cancelTarget}
          title={t("mybookings.cancel.title")}
          confirmLabel={t("mybookings.cancel.confirm")}
          cancelLabel={t("mybookings.cancel.keep")}
          onCancel={() => {
            setCancelId(null)
            setCancelReason("")
          }}
          onConfirm={() => {
            if (!cancelTarget) return
            dispatch({ type: "REQUEST_CANCEL", id: cancelTarget.id, reason: cancelReason.trim() || undefined })
            setCancelReason("")
            setFlash(
              t("mybookings.cancel.flash", { id: cancelTarget.id }),
            )
            setCancelId(null)
          }}
        >
          {cancelTarget && (
            <>
              <p className="mb-3 font-semibold text-ink-900">
                {cancelTarget.id}: {prettyDate(cancelTarget.date)},{" "}
                {resolveSlot(state.slots, cancelTarget.slotId)?.label ?? cancelTarget.slotId},{" "}
                {t("mybookings.cancel.summary", {
                  guests: t("checkout.guestsCount", { n: cancelTarget.guests }),
                  total: peso(cancelTarget.total),
                  paid: peso(cancelTarget.paid),
                })}
              </p>
              {isWithinCutoff(cancelTarget, settings) ? (
                <p className="rounded-xl bg-success-50 p-4 leading-6 text-success-900">
                  {t("mybookings.cancel.eligible1", { hours: settings.cancellationHours })}{" "}
                  <strong>{t("mybookings.cancel.eligible2")}</strong>
                  {cancelTarget.paid > 0 ? ` ${t("mybookings.cancel.ofAmount", { amount: peso(cancelTarget.paid) })}` : ""}
                  {t("mybookings.cancel.eligible3")}
                </p>
              ) : (
                <p className="rounded-xl bg-warning-50 p-4 leading-6 text-warning-900">
                  {t("mybookings.cancel.late1")}{" "}
                  <strong>{t("mybookings.cancel.late2")}</strong>{" "}
                  {t("mybookings.cancel.late3", { hours: settings.cancellationHours })}
                  {cancelTarget.paid > 0 ? ` ${t("mybookings.cancel.ofAmount", { amount: peso(cancelTarget.paid) })}` : ""}{" "}
                  {t("mybookings.cancel.late4")}
                </p>
              )}
              <label className="mt-4 grid gap-1.5 text-sm font-semibold text-ink-900">
                <span>
                  Reason for cancelling <span className="font-normal text-slate-500">(Optional)</span>
                </span>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value.slice(0, 500))}
                  rows={3}
                  maxLength={500}
                  placeholder="You can leave this empty. Tell us why if you like, it helps us improve."
                  className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-sm font-normal outline-none focus:border-aqua-500 focus:ring-4 focus:ring-aqua-100"
                />
                <span className="text-right text-xs font-normal text-slate-400">{cancelReason.length}/500</span>
              </label>
              <p className="mt-3 text-xs text-slate-500">
                {t("mybookings.cancel.note")}
              </p>
            </>
          )}
        </ConfirmDialog>

        <Modal
          open={!!balanceTarget}
          title={t("mybookings.payBalanceOnline")}
          onClose={() => setBalanceId(null)}
        >
          {balanceTarget && (
            <>
              <div className="grid gap-2 rounded-2xl bg-sand-100 p-5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">{t("mybookings.total")}</span>
                  <span>{peso(balanceTarget.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t("mybookings.paid")}</span>
                  <span>{peso(balanceTarget.paid)}</span>
                </div>
                <div className="mt-2 flex justify-between border-t pt-2 text-base font-extrabold text-aqua-800">
                  <span>{t("mybookings.balanceNow")}</span>
                  <span>{peso(balanceOf(balanceTarget))}</span>
                </div>
              </div>
              {balanceTarget.balanceProof?.status === "submitted" ? (
                <p className="mt-4 rounded-xl bg-warning-50 p-4 text-sm font-semibold text-warning-900">
                  {t("mybookings.balanceProofWaiting", { name: balanceTarget.balanceProof.name })}
                </p>
              ) : (
                <div className="mt-6 grid gap-6">
                  {balanceTarget.balanceProof?.status === "rejected" && (
                    <p className="rounded-xl bg-danger-50 p-3 text-sm font-semibold text-danger-700">
                      {t("mybookings.lastRejected")}
                    </p>
                  )}
                  <div className="grid justify-items-center gap-5 rounded-2xl bg-aqua-50 p-6 text-center">
                    <PayQr size={220} amount={balanceOf(balanceTarget)} />
                    <p className="max-w-sm text-sm leading-6 text-slate-600">
                      {t("mybookings.balanceScan1")}{" "}
                      <strong>{peso(balanceOf(balanceTarget))}</strong>{t("mybookings.balanceScan2")}
                    </p>
                  </div>
                  <label className="grid gap-2 text-sm font-semibold">
                    {t("mybookings.uploadPaymentProof")}
                    <ImageInput
                      onPick={async (f) => {
                        if (!f) {
                          setProofFile("")
                          setProofImg(undefined)
                          return
                        }
                        const r = await readProof(f)
                        setProofFile(r.name)
                        setProofImg(r.image)
                      }}
                      className="rounded-xl border border-dashed border-aqua-300 bg-aqua-50 p-4 text-sm font-normal file:mr-3 file:rounded-lg file:border-0 file:bg-aqua-700 file:px-3 file:py-2 file:font-bold file:text-white"
                    />
                  </label>
                </div>
              )}
              <div className="mt-8 flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setBalanceId(null)}>
                  {t("mybookings.later")}
                </Button>
                {balanceTarget.balanceProof?.status !== "submitted" && (
                  <Button
                    disabled={!proofFile}
                    onClick={() =>
                      ask({
                        title: t("mybookings.balanceSubmit.title"),
                        confirmLabel: t("mybookings.submitProof"),
                        body: t("mybookings.balanceSubmit.body", {
                          file: proofFile,
                          amount: peso(balanceOf(balanceTarget)),
                          id: balanceTarget.id,
                          date: prettyDate(balanceTarget.date),
                        }),
                        run: () => {
                          dispatch({
                            type: "BALANCE_PROOF",
                            id: balanceTarget.id,
                            name: proofFile,
                            image: proofImg,
                          })
                          setFlash(
                            t("mybookings.balanceSubmit.flash", { id: balanceTarget.id }),
                          )
                          setBalanceId(null)
                        },
                      })
                    }
                  >
                    <Upload size={16} /> {t("mybookings.submitProof")}
                  </Button>
                )}
              </div>
            </>
          )}
        </Modal>

        <Modal
          open={!!proofTarget}
          title={t("mybookings.proof.modalTitle")}
          onClose={() => setProofId(null)}
        >
          {proofTarget && (
            <div className="grid gap-4">
              <p className="text-sm text-slate-600">
                {t("mybookings.proof.amountDue")}{" "}
                <strong>{peso(proofTarget.dueNow ?? proofTarget.total)}</strong>
              </p>
              {proofMethod === "qr" && (
                <PayQr size={200} amount={proofTarget.dueNow ?? proofTarget.total} />
              )}
              <p className="rounded-xl bg-aqua-50 p-3 text-xs text-slate-600">
                {t("mybookings.proof.help")}
              </p>
              <ImageInput
                onPick={async (f) => {
                  if (!f) {
                    setProofFile("")
                    setProofImg(undefined)
                    return
                  }
                  const r = await readProof(f)
                  setProofFile(r.name)
                  setProofImg(r.image)
                }}
                className="rounded-xl border border-dashed border-aqua-300 bg-aqua-50 p-4 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-aqua-700 file:px-3 file:py-2 file:font-bold file:text-white"
              />
              <Button
                disabled={!proofFile}
                onClick={() =>
                  ask({
                    title: t("mybookings.proof.confirmTitle"),
                    confirmLabel: t("mybookings.submitProof"),
                    body: t("mybookings.proof.confirmBody", {
                      file: proofFile,
                      amount: peso(proofTarget.dueNow ?? proofTarget.total),
                      id: proofTarget.id,
                    }),
                    run: () => {
                      dispatch({
                        type: "PAYMENT_PROOF",
                        id: proofTarget.id,
                        method: proofMethod,
                        proofName: proofFile,
                        proofImage: proofImg,
                      })
                      setFlash(t("mybookings.proof.flash", { id: proofTarget.id }))
                      setProofId(null)
                    },
                  })
                }
              >
                <Upload size={16} /> {t("mybookings.submitProof")}
              </Button>
            </div>
          )}
        </Modal>

        {dialog}

        <Modal
          open={!!receiptTarget}
          title={
            receiptTarget && receiptState(receiptTarget) === "official"
              ? t("mybookings.officialReceipt")
              : t("mybookings.reservedReceipt")
          }
          onClose={() => setReceiptId(null)}
        >
          {receiptTarget && (
            <>
              <div id="ticket-print" className="rounded-2xl border-2 border-dashed border-aqua-200 p-5 text-sm">
                <p className="text-center text-lg font-extrabold text-aqua-800">
                  Golden Pyramid Swimming Pool
                </p>
                <p className="text-center text-xs text-slate-500">
                  {receiptState(receiptTarget) === "official"
                    ? t("mybookings.rcpt.official")
                    : t("mybookings.rcpt.reserved")}
                </p>
                <div className="mt-4 grid gap-2">
                  {(
                    [
                      [t("mybookings.rcpt.booking"), receiptTarget.id],
                      [t("mybookings.rcpt.guest"), receiptTarget.guestName],
                      [t("mybookings.rcpt.visit"), prettyDate(receiptTarget.date)],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <span className="text-slate-500">{k}</span>
                      <strong className="min-w-0 break-all text-right">{v}</strong>
                    </div>
                  ))}
                  <div className="my-2 border-y py-3">
                    <BookingBill booking={receiptTarget} />
                  </div>
                  {(
                    [
                      [t("mybookings.paid"), peso(receiptTarget.paid)],
                      [t("mybookings.rcpt.balance"), peso(balanceOf(receiptTarget))],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-slate-500">{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <Button className="mt-5 w-full" onClick={() => window.print()}>
                <Printer size={16} /> {t("mybookings.printReceipt")}
              </Button>
            </>
          )}
        </Modal>
      </main>
    </PublicLayout>
  )
}
