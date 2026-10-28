import type { AppState, Notice, WaitlistEntry } from "../types"
import { unitAvailability } from "./ops"

const LEGACY: Record<string, string> = { morning: "day-tour", afternoon: "night-swim", evening: "room-stay" }
const canon = (id: string) => LEGACY[id] ?? id
const DEAD = ["cancelled", "expired", "no-show"]
const DEFAULT_CAP: Record<string, number> = { "day-tour": 120, "night-swim": 100, "room-stay": 36, event: 150 }
const HOURS_TO_BOOK = 24

const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/** Guests already booked in a session. */
export const slotUsed = (state: AppState, date: string, slotId: string) =>
  state.bookings
    .filter((b) => b.date === date && canon(b.slotId) === canon(slotId) && !DEAD.includes(b.status))
    .reduce((sum, b) => sum + b.guests, 0)

export const slotCapacity = (state: AppState, slotId: string) =>
  state.slots.find((s) => canon(s.id) === canon(slotId))?.capacity ?? DEFAULT_CAP[canon(slotId)] ?? 0

/** Whether this wish could be booked right now. */
export function entryFits(state: AppState, e: Pick<WaitlistEntry, "date" | "slotId" | "cottageId" | "guests">) {
  const closed = state.blackouts.some((b) => b.date === e.date && (!b.slotId || canon(b.slotId) === canon(e.slotId)))
  if (closed) return false
  if (slotUsed(state, e.date, e.slotId) + e.guests > slotCapacity(state, e.slotId)) return false
  if (e.cottageId) {
    const item = state.cottages.find((c) => c.id === e.cottageId)
    if (!item || item.status !== "available") return false
    if (unitAvailability(state, item, e.date, e.slotId).left <= 0) return false
  }
  return true
}

/** Number of people waiting for a date/session (all rooms and cottages). */
export const waitingCount = (state: AppState, date: string, slotId: string) =>
  (state.waitlist ?? []).filter((w) => w.status !== "expired" && w.date === date && canon(w.slotId) === canon(slotId)).length

const note = (n: Omit<Notice, "id" | "at">, i: number): Notice => ({
  id: `N-${Date.now()}-w${i}-${Math.random().toString(36).slice(2, 5)}`,
  at: new Date().toISOString(),
  ...n,
})

/** After any change: expire stale offers and tell the first waiting guest whose request now fits. */
export function promoteWaitlist(state: AppState): AppState {
  const list = state.waitlist ?? []
  if (!list.length) return state
  const now = Date.now()
  let changed = false
  const next: WaitlistEntry[] = list.map((w) => {
    if (w.status === "notified" && w.expiresAt && new Date(w.expiresAt).getTime() <= now) {
      changed = true
      return { ...w, status: "expired" as const }
    }
    return w
  })
  const notices: Notice[] = []
  const keyOf = (w: WaitlistEntry) => `${w.date}|${canon(w.slotId)}|${w.cottageId ?? ""}`
  const today = localISO(new Date())
  next
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.status === "waiting" && w.date >= today)
    .sort((a, b) => a.w.createdAt.localeCompare(b.w.createdAt))
    .forEach(({ w, i }) => {
      // One open offer per session/unit at a time, so we never promise the same space twice.
      if (next.some((o) => o.status === "notified" && keyOf(o) === keyOf(w))) return
      if (!entryFits(state, w)) return
      const at = new Date()
      next[i] = { ...w, status: "notified", notifiedAt: at.toISOString(), expiresAt: new Date(at.getTime() + HOURS_TO_BOOK * 3_600_000).toISOString() }
      notices.push(
        note(
          {
            audience: "guest",
            guestId: w.guestId,
            message: `Good news: space opened up for ${w.guests} guest${w.guests === 1 ? "" : "s"} on ${w.date}. Book within ${HOURS_TO_BOOK} hours to keep your turn. Spaces are first come, first served. (In-app notice; SMS/email sending is simulated in this prototype.)`,
          },
          notices.length,
        ),
      )
      changed = true
    })
  if (!changed) return state
  return { ...state, waitlist: next, notices: [...notices, ...state.notices] }
}

/** Create one in-app reminder per booking that is confirmed for tomorrow. */
export function dayBeforeReminders(state: AppState): AppState {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const tomorrow = localISO(d)
  const due = state.bookings.filter(
    (b) => b.date === tomorrow && b.status === "confirmed" && !b.dayBeforeReminderAt && !!b.guestId,
  )
  if (!due.length) return state
  const stamp = new Date().toISOString()
  const ids = new Set(due.map((b) => b.id))
  return {
    ...state,
    bookings: state.bookings.map((b) => (ids.has(b.id) ? { ...b, dayBeforeReminderAt: stamp } : b)),
    notices: [
      ...due.map((b, i) =>
        note(
          {
            audience: "guest",
            guestId: b.guestId,
            bookingId: b.id,
            message: `Reminder: your visit (${b.id}) is tomorrow, ${b.date}. Bring your QR ticket and a valid ID. (In-app reminder; SMS/email sending is simulated in this prototype.)`,
          },
          i,
        ),
      ),
      ...state.notices,
    ],
  }
}
