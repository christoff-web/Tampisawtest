import type { Booking, Guest, Risk, RiskRules, Settings } from "../types"

export const peso = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount)

export const prettyDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })

export const prettyDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const slotLabels: Record<string, string> = {
  "day-tour": "Day Tour",
  "night-swim": "Night Swimming",
  "room-stay": "Room Accommodation",
  event: "Pavilion Event",
}

const slotStartHour: Record<string, number> = {
  "day-tour": 8,
  "night-swim": 18,
  "room-stay": 14,
  event: 8,
  morning: 8,
  afternoon: 18,
  evening: 14,
}

export const slotStart = (booking: Pick<Booking, "date" | "slotId">) => {
  const d = new Date(`${booking.date}T00:00:00`)
  d.setHours(slotStartHour[booking.slotId] ?? 8, 0, 0, 0)
  return d
}

export const hoursUntil = (booking: Pick<Booking, "date" | "slotId">) =>
  (slotStart(booking).getTime() - Date.now()) / 3_600_000

export const balanceOf = (booking: Booking) =>
  Math.max(0, booking.total - booking.paid)

/** Pool: full payment. Cottage / room / event: downpayment %. */
export const requiredNow = (
  type: Booking["type"],
  total: number,
  settings: Settings,
  option?: "partial" | "full",
) =>
  type === "pool" || option === "full"
    ? total
    : Math.round((total * settings.downpaymentPct) / 100)

/** Hold length in hours per Booking Rules (Regular or Peak); shortened to 1h when the visit is within 24h. */
export const holdHours = (
  settings: Settings,
  type: Booking["type"],
  hoursAway: number,
) => {
  const set = settings.peakSeason ? settings.hold.peak : settings.hold.regular
  const base = type === "pool" ? set.poolHours : set.cottageHours
  return hoursAway < 24 ? Math.min(base, 1) : base
}

export const isWithinCutoff = (booking: Booking, settings: Settings) =>
  hoursUntil(booking) >= settings.cancellationHours

/** True for online bookings made at least `confirmationHours` ahead (they have a confirmation window). */
export const needsConfirmation = (booking: Booking, settings: Settings) => {
  if (booking.source === "walk-in" || !booking.createdAt) return false
  const lead =
    (slotStart(booking).getTime() - new Date(booking.createdAt).getTime()) /
    3_600_000
  return lead >= settings.confirmationHours
}

export type RiskFactor = { label: string; points: number }

export function riskFactors(
  booking: Booking,
  guest: Guest | undefined,
  rules: RiskRules,
  confirmationHours = 48,
): RiskFactor[] {
  if (booking.source === "walk-in") return []
  const out: RiskFactor[] = []
  if (guest?.noShows)
    out.push({
      label: `${guest.noShows} previous no-show${guest.noShows > 1 ? "s" : ""}`,
      points: rules.previousNoShow * guest.noShows,
    })
  if (guest?.cancellations)
    out.push({
      label: `${guest.cancellations} past cancellation${guest.cancellations > 1 ? "s" : ""}`,
      points: rules.previousCancellation * guest.cancellations,
    })
  if (booking.paymentStatus !== "verified" && booking.paid <= 0)
    out.push({ label: "No deposit verified", points: rules.noConfirmation })
  else if (!booking.attendanceConfirmed && hoursUntil(booking) < confirmationHours)
    out.push({ label: "Attendance not confirmed", points: rules.noConfirmation })
  if (booking.createdAt) {
    const lead =
      (slotStart(booking).getTime() - new Date(booking.createdAt).getTime()) /
      3_600_000
    if (lead < 72)
      out.push({ label: "Booked less than 3 days ahead", points: rules.lateBooking })
  }
  if (booking.guests >= 10)
    out.push({ label: "Group of 10+", points: rules.largeGroup })
  return out
}

export const riskScoreOf = (
  booking: Booking,
  guest: Guest | undefined,
  rules: RiskRules,
  confirmationHours = 48,
) =>
  Math.min(
    100,
    riskFactors(booking, guest, rules, confirmationHours).reduce(
      (sum, f) => sum + f.points,
      0,
    ),
  )

export const riskLevel = (score: number, rules: RiskRules): Risk =>
  score >= rules.highFrom ? "high" : score >= rules.mediumFrom ? "medium" : "low"

export const braceletColor = (type: Booking["type"], slotId: string) =>
  type === "pool"
    ? slotId === "night-swim"
      ? "Indigo (Pool night)"
      : "Aqua (Pool day)"
    : type === "cottage"
      ? slotId === "night-swim"
        ? "Orange (Cottage night)"
        : "Yellow (Cottage day)"
      : type === "room"
        ? "Green (Room)"
        : "Pink (Event)"

export const bookingCode = (id: string) => id
