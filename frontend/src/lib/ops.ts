import type {
  Addon,
  AppState,
  Booking,
  BookingAddon,
  Cottage,
  GuestKind,
  GuestMix,
  Role,
  SessionTier,
  Tariff,
  Waiver,
} from "../types"

export const tierOf = (slotId: string): SessionTier =>
  slotId === "night-swim" ? "night" : slotId === "room-stay" ? "overnight" : "day"

export const tierLabel: Record<SessionTier, string> = {
  day: "Day swimming",
  night: "Night swimming",
  overnight: "22-hour / overnight",
}

export const kindLabel: Record<GuestKind, string> = {
  adult: "Adult",
  child: "Child",
  senior: "Senior citizen",
  pwd: "PWD",
}

export const emptyMix = (): GuestMix => ({ adult: 0, child: 0, senior: 0, pwd: 0 })
export const mixTotal = (mix: GuestMix) => mix.adult + mix.child + mix.senior + mix.pwd

export type AdmissionLine = {
  kind: GuestKind
  qty: number
  rate: number
  gross: number
  discount: number
  net: number
}

/** Senior/PWD get the statutory % off the adult rate for the session tier. */
export function admissionLines(tariff: Tariff, slotId: string, mix: GuestMix): AdmissionLine[] {
  const rates = tariff.rates[tierOf(slotId)]
  return (Object.keys(mix) as GuestKind[])
    .filter((kind) => mix[kind] > 0)
    .map((kind) => {
      const rate = rates[kind]
      const gross = rate * mix[kind]
      const statutory = kind === "senior" || kind === "pwd"
      const discount = statutory ? Math.round((gross * tariff.statutoryDiscountPct) / 100) : 0
      return { kind, qty: mix[kind], rate, gross, discount, net: gross - discount }
    })
}

export const admissionTotal = (lines: AdmissionLine[]) => lines.reduce((s, l) => s + l.net, 0)
export const admissionDiscount = (lines: AdmissionLine[]) => lines.reduce((s, l) => s + l.discount, 0)
export const addonsTotal = (addons: BookingAddon[] = []) =>
  addons.reduce((s, a) => s + a.price * a.qty, 0)
export const addonDepositTotal = (addons: BookingAddon[] = []) =>
  addons.reduce((s, a) => s + a.deposit * a.qty, 0)

export type Ledger = {
  lines: AdmissionLine[]
  admission: number
  discount: number
  cottage: number
  addons: number
  addonDeposit: number
  total: number
}

/** One consolidated bill: headcount x session tier, cottage tier, add-ons (deposit is refundable, listed separately). */
export function computeLedger(
  tariff: Tariff,
  slotId: string,
  mix: GuestMix,
  cottagePrice = 0,
  addons: BookingAddon[] = [],
): Ledger {
  const lines = admissionLines(tariff, slotId, mix)
  const admission = admissionTotal(lines)
  const add = addonsTotal(addons)
  return {
    lines,
    admission,
    discount: admissionDiscount(lines),
    cottage: cottagePrice,
    addons: add,
    addonDeposit: addonDepositTotal(addons),
    total: admission + cottagePrice + add,
  }
}

const ACTIVE = ["pending", "reserved", "confirmed", "checked-in"]

/** Units of an add-on already committed on a date (hard cap, e.g. 1 karaoke per day). */
export const addonTaken = (state: AppState, addonId: string, date: string) =>
  state.bookings
    .filter((b) => b.date === date && ACTIVE.includes(b.status))
    .reduce((s, b) => s + (b.addons?.find((a) => a.id === addonId)?.qty ?? 0), 0)

export const addonLeft = (state: AppState, addon: Addon, date: string) =>
  Math.max(0, addon.dailyCap - addonTaken(state, addon.id, date))

/** Overtime: after grace, bill started blocks (default 60 min) at guest + cottage hourly rates. */
export function computeOvertime(
  tariff: Tariff,
  booking: Booking,
  checkoutAt: Date,
  expectedEnd: Date,
  hasCottage: boolean,
) {
  const minutesOver = Math.max(0, Math.round((checkoutAt.getTime() - expectedEnd.getTime()) / 60_000))
  if (minutesOver <= tariff.overtime.graceMinutes)
    return { minutesOver, billedHours: 0, fee: 0 }
  const blocks = Math.ceil(minutesOver / tariff.overtime.blockMinutes)
  const billedHours = (blocks * tariff.overtime.blockMinutes) / 60
  const tier = tierOf(booking.slotId)
  const perHour =
    tariff.overtime.perGuestHour[tier] * booking.guests +
    (hasCottage ? tariff.overtime.perCottageHour[tier] : 0)
  return { minutesOver, billedHours, fee: Math.round(perHour * billedHours) }
}

export const sessionMinutesFor = (slotId: string) =>
  slotId === "night-swim" ? 480 : slotId === "room-stay" ? 1320 : slotId === "event" ? 240 : 480

/** Session timer: remaining ms (negative when overdue). */
export const sessionRemainingMs = (b: Booking, now = Date.now()) =>
  b.checkedInAtISO
    ? new Date(b.checkedInAtISO).getTime() + (b.sessionMinutes ?? sessionMinutesFor(b.slotId)) * 60_000 - now
    : null

export const formatCountdown = (ms: number) => {
  const sign = ms < 0 ? "-" : ""
  const t = Math.floor(Math.abs(ms) / 1000)
  const h = String(Math.floor(t / 3600)).padStart(2, "0")
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0")
  const s = String(t % 60).padStart(2, "0")
  return `${sign}${h}:${m}:${s}`
}

export async function sha256Hex(text: string) {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("")
  }
  return sha256Fallback(new TextEncoder().encode(text))
}

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

/** Pure-JS SHA-256 so QR tokens stay identical on non-HTTPS pages where crypto.subtle is unavailable. */
function sha256Fallback(data: Uint8Array) {
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const bitLen = data.length * 8
  const padded = new Uint8Array((((data.length + 9 + 63) >> 6) << 6))
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32))
  view.setUint32(padded.length - 4, bitLen >>> 0)
  const w = new Array<number>(64)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("")
}

const QR_SECRET = "golden-pyramid-tampisaw-qr-v1"

/** QR payload: the full 64-character SHA-256 hex digest of the booking details plus a secret. */
export async function signQrToken(b: Pick<Booking, "id" | "date" | "slotId" | "guests">) {
  return sha256Hex(`${b.id}|${b.date}|${b.slotId}|${b.guests}|${QR_SECRET}`)
}

export async function verifyQrToken(token: string, bookings: Booking[]) {
  const t = token.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(t)) return null
  for (const b of bookings) if ((await signQrToken(b)) === t) return b
  return null
}

export const waiverRules = [
  "No diving in any pool area.",
  "An adult must actively supervise every child at all times.",
  "Proper swimwear is required in the water.",
]

export const healthQuestions = [
  { id: "wounds", label: "Open wounds, cuts, or skin sores" },
  { id: "contagious", label: "Communicable or contagious illness (fever, flu, skin infection, eye infection)" },
  { id: "cardio", label: "Heart, blood-pressure, or breathing condition (e.g. asthma)" },
  { id: "pregnant", label: "Currently pregnant" },
  { id: "other", label: "Other health condition we should know about" },
]

export const WAIVER_VERSION = "GP-WAIVER-2026.1"

export async function buildWaiver(input: {
  rules: string[]
  health: Record<string, boolean>
  healthOther?: string
  dpaConsent: boolean
  guardian?: Waiver["guardian"]
  bookingRef: string
}): Promise<Waiver> {
  const acceptedAt = new Date().toISOString()
  const body = JSON.stringify({ ...input, acceptedAt, version: WAIVER_VERSION })
  return {
    acceptedAt,
    version: WAIVER_VERSION,
    rules: input.rules,
    health: input.health,
    healthOther: input.health.other ? input.healthOther?.trim() || undefined : undefined,
    flagged: Object.values(input.health).some(Boolean),
    dpaConsent: input.dpaConsent,
    guardian: input.guardian,
    hash: await sha256Hex(body),
  }
}

/** Lifeguards required for an expected headcount. */
export const guardsNeeded = (headcount: number, perGuard: number, min: number) =>
  Math.max(min, Math.ceil(headcount / Math.max(1, perGuard)))

/** Pool water safe ranges used by the maintenance ledger. */
export const poolRange = { ph: [7.2, 7.8], chlorine: [1, 3] } as const
export const poolLogStatus = (ph: number, chlorine: number) =>
  ph >= poolRange.ph[0] && ph <= poolRange.ph[1] && chlorine >= poolRange.chlorine[0] && chlorine <= poolRange.chlorine[1]
    ? "ok"
    : "out-of-range"

/** Cottage duration caps (hours) from tariff. */
export const durationCapFor = (tariff: Tariff, slotId: string) =>
  slotId === "night-swim" ? tariff.durationCapHours.nightCottage : tariff.durationCapHours.dayCottage

type Access = { prefix: string; roles: Role[] }
/** Route prefix -> roles. First longest match wins. */
export const routeAccess: Access[] = [
  { prefix: "/root", roles: ["root-admin"] },
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/staff", roles: ["admin", "receptionist"] },
]
/** Admin tools. The root admin is not an operational role: it only has the staff accounts and audit log modules. */
export const isAdminRole = (role?: Role | string | null) => role === "admin"
export const canHandleCash = (role?: Role) => role === "admin" || role === "receptionist"

export const canAccess = (role: Role, path: string) => {
  const rule = [...routeAccess]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((r) => path === r.prefix || path.startsWith(r.prefix + "/"))
  return rule ? rule.roles.includes(role) : true
}

export const roleLabel: Record<Role, string> = {
  guest: "Guest",
  admin: "Administrator",
  "root-admin": "Root administrator",
  receptionist: "Front desk",
}

const DEAD_STATUSES = ["cancelled", "expired", "no-show"]

/**
 * Does this booking still occupy its date, session and space? Cancelled, expired and no-show bookings never do, and neither
 * does a booking whose payment was rejected before anything was paid. Same rule as the server (Ops.BlocksAvailability).
 */
export const blocksAvailability = (b: { status: string; paymentStatus?: string; paid: number; archived?: boolean }) =>
  !b.archived && !DEAD_STATUSES.includes(b.status) && !(b.paymentStatus === "rejected" && b.paid <= 0)
const LEGACY_SLOTS: Record<string, string> = { morning: "day-tour", afternoon: "night-swim", evening: "room-stay" }
const canonSlot = (id: string) => LEGACY_SLOTS[id] ?? id

export const unitsOf = (c?: Cottage) => Math.max(1, c?.units ?? 1)

/** How many units of a cottage/room/table remain for a date and session. Long tables and the exclusive canteen block each other. */
export function unitAvailability(
  state: AppState,
  cottage: Cottage,
  date: string,
  slotId: string,
  o: { eventStart?: string; ignoreBookingId?: string; holdId?: string; guestId?: string } = {},
) {
  const now = Date.now()
  const sameSession = (d: string, s: string) => d === date && (cottage.kind === "room" || canonSlot(s) === canonSlot(slotId))
  const live = state.bookings.filter(
    (b) => b.id !== o.ignoreBookingId && blocksAvailability(b) && sameSession(b.date, b.slotId),
  )
  // A hold only blocks other people: the guest who is checking out never blocks themselves, and a hold on one event block
  // (8-12) does not block another block (1-5) of the same pavilion.
  const holds = state.holds.filter(
    (h) =>
      h.id !== o.holdId &&
      !(o.guestId && h.guestId === o.guestId) &&
      new Date(h.expiresAt).getTime() > now &&
      sameSession(h.date, h.slotId) &&
      (cottage.kind !== "event" || !h.eventStart || h.eventStart === o.eventStart),
  )
  const countFor = (id: string) =>
    live.filter((b) => b.cottageId === id && (cottage.kind !== "event" || b.eventStart === o.eventStart)).length +
    holds.filter((h) => h.cottageId === id).length
  const total = unitsOf(cottage)
  let blockedBy: string | undefined
  if (cottage.id === "c4" && countFor("c3") > 0)
    blockedBy = "A long table is already reserved for this session, so the exclusive canteen can't be booked."
  if (cottage.id === "c3" && countFor("c4") > 0)
    blockedBy = "The canteen is reserved exclusively for this session."
  const taken = countFor(cottage.id)
  return { total, taken, left: blockedBy ? 0 : Math.max(0, total - taken), blockedBy }
}

export const lettersOnly = (v: string) => v.replace(/[^\p{L} ]/gu, "").replace(/ {2,}/g, " ")
export const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, 11)

/**
 * Contact number as the person types it: only digits, spaces, dashes, brackets and a leading +. The checks mirror the server
 * (Ops.CanonicalPhone): 09XXXXXXXXX, +639XXXXXXXXX or 639XXXXXXXXX, and not one repeated digit.
 */
export const cleanPhoneInput = (v: string) => v.replace(/[^\d+ ()-]/g, "").replace(/(?!^)\+/g, "").slice(0, 18)
export const canonicalPhone = (v: string): string | null => {
  const raw = v.trim()
  if (!raw || !/^\+?[0-9 ()-]+$/.test(raw)) return null
  const digits = raw.replace(/\D/g, "")
  let local: string
  if (digits.startsWith("63") && digits.length === 12) local = "0" + digits.slice(2)
  else if (!raw.startsWith("+") && digits.length === 11 && digits.startsWith("09")) local = digits
  else return null
  if (!/^09\d{9}$/.test(local) || new Set(local.slice(2)).size === 1) return null
  return local
}
/** A short red message while typing, or "" when the number is fine (or still empty). */
export const phoneProblem = (v: string): string => {
  if (!v.trim()) return ""
  if (/[^\d+ ()-]/.test(v)) return "Use digits only (spaces, dashes and a leading + are allowed)."
  if (canonicalPhone(v)) return ""
  const digits = v.replace(/\D/g, "")
  if (digits.length < 10) return "Keep typing: a mobile number is 11 digits starting with 09 (or +63 9...)."
  return "Enter a valid mobile number such as 09171234567 or +639171234567."
}

export const PASSWORD_RULES = [
  { id: "len", label: "At least 8 characters", ok: (p: string) => p.length >= 8 },
  { id: "upper", label: "One uppercase letter (A-Z)", ok: (p: string) => /\p{Lu}/u.test(p) },
  { id: "digit", label: "One number (0-9)", ok: (p: string) => /\d/.test(p) },
  { id: "special", label: "One special character (! @ # $ % & *)", ok: (p: string) => /[^\p{L}\d\s]/u.test(p) },
] as const
export const passwordProblems = (p: string) => PASSWORD_RULES.filter((r) => !r.ok(p)).map((r) => r.label)
export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())

/** How a booking was paid, for the Payments & refunds screens. */
export const paymentMethodLabel = (b: { paymentMethod?: string; balanceMethod?: string; paid?: number }) => {
  const m = b.paymentMethod ?? b.balanceMethod
  if (m === "cash") return "Cash"
  if (m === "qr" || m === "gcash" || m === "ewallet" || m === "e-wallet") return "E-Wallet"
  return (b.paid ?? 0) > 0 ? "Not recorded" : "Not paid yet"
}
/** Pending (nothing paid yet), Partially paid, or Fully paid. */
export const paymentProgress = (b: { paid: number; total: number }) =>
  b.paid <= 0 ? "Pending" : b.paid < b.total ? "Partially paid" : "Fully paid"
export const paymentOptionLabel = (o?: string) => (o === "full" ? "Full payment" : o === "partial" ? "Partial (down payment)" : "—")
export const bookingSourceLabel = (s?: string) => (s === "walk-in" ? "Walk-in" : "Online")
export const isValidName = (v: string) => /^\p{L}+( \p{L}+)*$/u.test(v.trim())
/** Human-readable arrival (cash reservations), or undefined when none was given. */
export const arrivalLabel = (b: { arrivalDate?: string; arrivalTime?: string }) => {
  if (!b.arrivalDate) return undefined
  const d = new Date(`${b.arrivalDate}T12:00:00`).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
  if (!b.arrivalTime) return d
  const [h, m] = b.arrivalTime.split(":").map(Number)
  const t = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
  return `${d}, ${t}`
}

export const isValidPhone = (v: string) => canonicalPhone(v) !== null
export const ageOn = (iso: string) => {
  const b = new Date(`${iso}T12:00:00`)
  const t = new Date()
  let age = t.getFullYear() - b.getFullYear()
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--
  return age
}
