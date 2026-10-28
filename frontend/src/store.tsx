import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Context,
  type ReactNode,
} from "react"
import { apiDispatch, apiGetState, apiPost, ServerUnreachable, type ServerResult, type ServerSnapshot } from "./api"
import { durationCapFor, isValidEmail, isValidPhone, passwordProblems } from "./lib/ops"
import { initialState } from "./data"
import { dayBeforeReminders, promoteWaitlist } from "./lib/waitlist"
import type {
  Addon,
  AppState,
  Blackout,
  Booking,
  DamageFee,
  LifeguardShiftName,
  Policy,
  OpsConfig,
  OvertimeCharge,
  PoolLog,
  Tariff,
  WaitlistEntry,
  Cottage,
  DraftBooking,
  Guest,
  Incident,
  MaintenanceRequest,
  Notice,
  Settings,
  Slot,
  User,
  SyncItem,
  ShiftReport,
} from "./types"
import { balanceOf, braceletColor, hoursUntil, needsConfirmation, peso } from "./lib/rules"

type Action =
  | { type: "DRAFT", payload: Partial<DraftBooking> }
  | { type: "CREATE_BOOKING", payload: Booking }
  | {
      type: "HOLD",
      payload: {
        id: string,
        date: string,
        slotId: string,
        guests: number,
        cottageId?: string,
        eventStart?: string,
      },
    }
  | { type: "RELEASE_HOLD", id: string }
  | {
      type: "PAYMENT_PROOF",
      id: string,
      method: "cash" | "qr",
      proofName: string,
      proofImage?: string,
    }
  | { type: "BALANCE_PROOF", id: string, name: string, image?: string }
  | { type: "BALANCE_PROOF_REJECT", id: string, by?: string }
  | { type: "VERIFY_PAYMENT", id: string, approved: boolean, by?: string, byRole?: string }
  | { type: "ADD_WALK_IN", payload: Booking }
  | { type: "CANCEL", id: string }
  | { type: "RESCHEDULE", id: string, date: string, slotId: string, by?: string }
  | { type: "CHECK_IN", id: string }
  | { type: "UPDATE_SLOT", payload: Slot }
  | { type: "UPDATE_COTTAGE", payload: Cottage }
  | { type: "SAVE_POLICY", policy: Policy, by: string }
  | { type: "DELETE_POLICY", id: string, by: string }
  | { type: "MARK_NO_SHOW", id: string }
  | {
      type: "ADD_BLACKOUT",
      date: string,
      slotId?: string,
      reason: string,
      kind?: Blackout["kind"],
    }
  // Root admin only: receptionist and admin logins. The server does the work; the answer replaces local state.
  | { type: "CREATE_STAFF_USER", name: string, email: string, phone: string, role: "receptionist" | "admin", password: string }
  | { type: "UPDATE_STAFF_USER", id: string, name: string, email: string, phone: string, role: "receptionist" | "admin" }
  | { type: "ARCHIVE_USER", id: string }
  | { type: "ARCHIVE_BOOKING", id: string }
  | { type: "RESTORE_BOOKING", id: string }
  | { type: "DELETE_BOOKING_PERMANENT", id: string }
  | { type: "ARCHIVE_GUEST", id: string }
  | { type: "RESTORE_GUEST", id: string }
  | { type: "RESTORE_USER", id: string }
  | { type: "DELETE_STAFF_USER", id: string }
  | { type: "SET_USER_PASSWORD", id: string, password: string }
  | { type: "REGISTER", user: User, guest: Guest }
  | { type: "DELETE_USER", id: string, by: string }
  | { type: "PAY_BALANCE", id: string, method: "online" | "counter", by: string }
  | { type: "COLLECT_PAYMENT", id: string, amount: number, by: string, note?: string, method?: "cash" | "gcash" }
  | { type: "CONFIRM_ATTENDANCE", id: string }
  | { type: "SEND_REMINDER", id: string, by: string }
  | { type: "REQUEST_CANCEL", id: string, reason?: string }
  | { type: "BULK_NOTIFY", ids: string[], message: string, by: string }
  | {
      type: "PROCESS_CANCEL",
      id: string,
      by: string,
      eligible: boolean,
      amount: number,
      reason?: string,
    }
  | { type: "ISSUE_BRACELETS", id: string, by: string }
  | {
      type: "SPOT_CHECK",
      bookingId?: string,
      serial?: string,
      result: "ok" | "wrong-service" | "transfer" | "broken",
      detail: string,
      by: string,
    }
  | { type: "REPLACE_BRACELET", id: string, reason: string, by: string }
  | { type: "TIME_OUT", id: string, returned: boolean, by: string }
  | {
      type: "ADD_INCIDENT",
      payload: Pick<Incident, "guestName" | "type" | "location" | "description"> &
        Partial<Incident>,
    }
  | {
      type: "UPDATE_INCIDENT",
      id: string,
      patch: Partial<Incident>,
      note?: string,
      by: string,
      notify?: string,
    }
  | {
      type: "ADD_MAINT",
      payload: Pick<MaintenanceRequest, "guestName" | "area" | "concern"> &
        Partial<MaintenanceRequest>,
    }
  | {
      type: "UPDATE_MAINT",
      id: string,
      patch: Partial<MaintenanceRequest>,
      note?: string,
      by: string,
      notify?: string,
    }
  | { type: "SAVE_SETTINGS", settings: Settings, by: string, detail?: string }
  | { type: "POOL_LOG", payload: Omit<PoolLog, "id" | "at"> }
  | { type: "ASSIGN_SHIFT", date: string, shift: LifeguardShiftName, guardId: string, by: string }
  | { type: "UNASSIGN_SHIFT", id: string, by: string }
  | { type: "SAVE_TARIFF", tariff: Tariff, by: string }
  | { type: "SAVE_OPS_CONFIG", config: OpsConfig, by: string }
  | { type: "SAVE_ADDON", addon: Addon, by: string }
  | { type: "ADD_DAMAGE_FEE", guestId: string, fee: Omit<DamageFee, "id" | "at" | "settled">, }
  | { type: "SETTLE_DAMAGE_FEE", guestId: string, feeId: string, by: string }
  | { type: "REMOVE_BLACKOUT", id: string, by: string }
  | { type: "SET_BLACKOUT_KIND", id: string, kind: NonNullable<Blackout["kind"]> }
  | { type: "BILL_OVERTIME", id: string, overtime: OvertimeCharge }
  | { type: "EXPIRY_ALERT", id: string }
  | { type: "SET_QR_TOKEN", id: string, token: string }
  | {
      type: "WEATHER_CANCEL",
      date: string,
      slotId?: string,
      mode: "refund" | "reschedule",
      newDate?: string,
      /** Only these bookings are affected; omit to apply to every active booking on the day. */
      ids?: string[],
      by: string,
    }
  | { type: "JOIN_WAITLIST", entry: Omit<WaitlistEntry, "id" | "createdAt" | "status"> }
  | { type: "LEAVE_WAITLIST", id: string }
  | { type: "TICK" }
  | { type: "QUEUE_SYNC", item: SyncItem }
  | { type: "SYNC_QUEUE" }
  | { type: "SAVE_SHIFT", report: ShiftReport }
  | { type: "HYDRATE", payload: AppState }
  | { type: "RESET" }

const notice = (n: Omit<Notice, "id" | "at">): Notice => ({
  id: `N-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  at: new Date().toISOString(),
  ...n,
})

const makeIncident = (
  count: number,
  p: Pick<Incident, "guestName" | "type" | "location" | "description"> &
    Partial<Incident>,
): Incident => ({
  id: `INC-${1001 + count}`,
  status: "requested",
  serious: false,
  escalated: false,
  source: "guest",
  createdAt: new Date().toISOString(),
  notes: [],
  ...p,
})

const makeMaint = (
  count: number,
  p: Pick<MaintenanceRequest, "guestName" | "area" | "concern"> &
    Partial<MaintenanceRequest>,
): MaintenanceRequest => ({
  id: `MNT-${2001 + count}`,
  details: "",
  urgent: false,
  status: "requested",
  escalated: false,
  createdAt: new Date().toISOString(),
  notes: [],
  ...p,
})

function reducer(state: AppState, action: Action): AppState {
  // Data from the server replaces everything except the booking wizard's in-progress draft.
  if (action.type === "HYDRATE") return { ...action.payload, draft: state.draft }
  let next = baseReducer(state, action)
  if (action.type === "TICK") next = dayBeforeReminders(next)
  if (action.type === "RESET" || action.type === "JOIN_WAITLIST") return next
  return next.bookings !== state.bookings || next.blackouts !== state.blackouts || action.type === "TICK" ? promoteWaitlist(next) : next
}

function baseReducer(state: AppState, action: Action): AppState {
  const audit = (
    actionName: string,
    bookingId?: string,
    actor = "Andrea M.",
  ) => ({
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    actor,
    action: actionName,
    bookingId,
  })
  switch (action.type) {
    case "DRAFT":
      return { ...state, draft: { ...state.draft, ...action.payload } }
    case "CREATE_BOOKING": {
      const cap = durationCapFor(state.tariff, action.payload.slotId)
      const cottageHours =
        action.payload.type === "cottage"
          ? Math.max(1, Math.min(action.payload.cottageHours ?? cap, cap))
          : undefined
      return {
        ...state,
        bookings: [
          { createdAt: new Date().toISOString(), receipt: "none", ...action.payload, cottageHours },
          ...state.bookings,
        ],
        holds: state.holds.filter(
          (hold) =>
            hold.slotId !== action.payload.slotId ||
            hold.date !== action.payload.date,
        ),
        auditLog: [
          audit(
            "Created pending reservation",
            action.payload.id,
            action.payload.guestName,
          ),
          ...state.auditLog,
        ],
      }
    }
    case "HOLD":
      return {
        ...state,
        holds: [
          ...state.holds.filter((hold) => hold.id !== action.payload.id),
          {
            ...action.payload,
            expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          },
        ],
      }
    case "RELEASE_HOLD":
      return {
        ...state,
        holds: state.holds.filter((hold) => hold.id !== action.id),
      }
    case "PAYMENT_PROOF":
      return {
        ...state,
        bookings: state.bookings.map((booking) =>
          booking.id === action.id
            ? {
                ...booking,
                paymentStatus: "submitted",
                paymentMethod: action.method,
                proofName: action.proofName,
                proofImage: action.proofImage,
              }
            : booking,
        ),
        auditLog: [
          audit("Submitted proof of payment", action.id, "Guest"),
          ...state.auditLog,
        ],
      }
    case "BALANCE_PROOF":
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.id
            ? { ...b, balanceProof: { name: action.name, image: action.image, submittedAt: new Date().toISOString(), status: "submitted" } }
            : b,
        ),
        notices: [
          notice({ audience: "staff", bookingId: action.id, message: `${action.id}: guest uploaded proof of balance payment for verification.` }),
          ...state.notices,
        ],
        auditLog: [audit("Submitted proof of balance payment", action.id, "Guest"), ...state.auditLog],
      }
    case "BALANCE_PROOF_REJECT": {
      const target = state.bookings.find((b) => b.id === action.id)
      if (!target?.balanceProof) return state
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.id && b.balanceProof ? { ...b, balanceProof: { ...b.balanceProof, status: "rejected" } } : b,
        ),
        notices: [
          notice({ audience: "guest", guestId: target.guestId, bookingId: target.id, message: `Your balance payment proof for ${target.id} was rejected. Please upload a clear proof again.` }),
          ...state.notices,
        ],
        auditLog: [audit("Rejected balance payment proof", action.id, action.by), ...state.auditLog],
      }
    }
    case "VERIFY_PAYMENT": {
      const target = state.bookings.find((b) => b.id === action.id)
      const by = action.by ?? "Staff"
      if (action.approved && action.byRole !== "admin") {
        if (!target || target.staffApproval) return state
        return {
          ...state,
          bookings: state.bookings.map((b) =>
            b.id === action.id ? { ...b, staffApproval: { by, at: new Date().toISOString() } } : b,
          ),
          notices: [
            notice({ audience: "staff", bookingId: target.id, message: `${target.id}: ${by} checked the payment proof. Waiting for admin to confirm the money was received.` }),
            ...state.notices,
          ],
          auditLog: [audit("Checked payment proof, awaiting admin confirmation", action.id, by), ...state.auditLog],
        }
      }
      return {
        ...state,
        bookings: state.bookings.map((booking) => {
          if (booking.id !== action.id) return booking
          if (!action.approved)
            return { ...booking, paymentStatus: "rejected", status: "pending", risk: "high", staffApproval: undefined }
          const paid = Math.max(booking.paid, booking.dueNow ?? booking.paid)
          const full = paid >= booking.total
          return {
            ...booking,
            paid,
            paymentStatus: "verified",
            staffApproval: undefined,
            status: booking.dueNow !== undefined && !full ? "reserved" : "confirmed",
            receipt: full ? "official" : "reserved",
            risk: booking.risk === "high" ? "high" : "low",
          }
        }),
        notices: target
          ? [
              notice({
                audience: "guest",
                guestId: target.guestId,
                bookingId: target.id,
                message: action.approved
                  ? `Payment verified for ${target.id}. Your reservation is now ${
                      target.dueNow !== undefined && target.dueNow < target.total ? "RESERVED (30% downpayment received)" : "CONFIRMED"
                    }.`
                  : `Your proof of payment for ${target.id} was rejected. Please upload a clear proof again.`,
              }),
              ...state.notices,
            ]
          : state.notices,
        auditLog: [
          audit(action.approved ? "Admin confirmed payment received" : "Rejected payment", action.id, by),
          ...state.auditLog,
        ],
      }
    }
    case "ADD_WALK_IN":
      return {
        ...state,
        bookings: [action.payload, ...state.bookings],
        auditLog: [
          audit(
            "Added and checked in walk-in",
            action.payload.id,
            "Gate Staff",
          ),
          ...state.auditLog,
        ],
        scanHistory: [
          `${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${action.payload.id} · ${action.payload.guestName} · ${action.payload.guests} guests`,
          ...state.scanHistory,
        ],
      }
    case "CANCEL":
      return {
        ...state,
        bookings: state.bookings.map((booking) =>
          booking.id === action.id
            ? { ...booking, status: "cancelled" }
            : booking,
        ),
        auditLog: [
          audit("Cancelled reservation", action.id),
          ...state.auditLog,
        ],
      }
    case "RESCHEDULE": {
      const target = state.bookings.find((b) => b.id === action.id)
      return {
        ...state,
        bookings: state.bookings.map((booking) =>
          booking.id === action.id
            ? { ...booking, date: action.date, slotId: action.slotId }
            : booking,
        ),
        notices: target
          ? [
              notice({ audience: "guest", guestId: target.guestId, bookingId: target.id, message: `${target.id} was rescheduled by the resort to ${action.date}.` }),
              ...state.notices,
            ]
          : state.notices,
        auditLog: [
          audit("Rescheduled reservation", action.id, action.by),
          ...state.auditLog,
        ],
      }
    }
    case "CHECK_IN":
      return {
        ...state,
        bookings: state.bookings.map((booking) =>
          booking.id === action.id
            ? {
                ...booking,
                status: "checked-in",
                checkedInAtISO: new Date().toISOString(),
                checkedInAt: new Date().toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                }),
              }
            : booking,
        ),
        auditLog: [
          audit("Checked in reservation", action.id, "Gate Staff"),
          ...state.auditLog,
        ],
        scanHistory: [
          `${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${action.id} · ${
            state.bookings.find((booking) => booking.id === action.id)
              ?.guestName || "Guest"
          } · ${state.bookings.find((booking) => booking.id === action.id)?.guests || 0} guests`,
          ...state.scanHistory,
        ],
      }
    case "UPDATE_SLOT":
      return {
        ...state,
        slots: state.slots.map((slot) =>
          slot.id === action.payload.id ? action.payload : slot,
        ),
      }
    case "SAVE_POLICY": {
      const exists = state.policies.some((p) => p.id === action.policy.id)
      return {
        ...state,
        policies: exists
          ? state.policies.map((p) => (p.id === action.policy.id ? action.policy : p))
          : [...state.policies, action.policy],
        auditLog: [audit(`${exists ? "Updated" : "Added"} policy: ${action.policy.title}`, undefined, action.by), ...state.auditLog],
      }
    }
    case "DELETE_POLICY":
      return {
        ...state,
        policies: state.policies.filter((p) => p.id !== action.id),
        auditLog: [audit("Removed a resort policy", undefined, action.by), ...state.auditLog],
      }
    case "UPDATE_COTTAGE":
      return {
        ...state,
        cottages: state.cottages.some(
          (cottage) => cottage.id === action.payload.id,
        )
          ? state.cottages.map((cottage) =>
              cottage.id === action.payload.id ? action.payload : cottage,
            )
          : [...state.cottages, action.payload],
      }
    case "MARK_NO_SHOW":
      return {
        ...state,
        bookings: state.bookings.map((booking) =>
          booking.id === action.id
            ? { ...booking, status: "no-show" }
            : booking,
        ),
        auditLog: [
          audit("Marked reservation as no-show", action.id, "Gate Staff"),
          ...state.auditLog,
        ],
      }
    case "ADD_BLACKOUT":
      return {
        ...state,
        blackouts: [
          {
            id: `BLK-${Date.now()}`,
            date: action.date,
            slotId: action.slotId,
            reason: action.reason,
            kind: action.kind ?? "closure",
          },
          ...state.blackouts,
        ],
        auditLog: [audit(`Added closure: ${action.reason}`), ...state.auditLog],
      }
    case "CREATE_STAFF_USER":
    case "UPDATE_STAFF_USER":
    case "ARCHIVE_USER":
    case "ARCHIVE_BOOKING":
    case "RESTORE_BOOKING":
    case "DELETE_BOOKING_PERMANENT":
    case "ARCHIVE_GUEST":
    case "RESTORE_GUEST":
    case "RESTORE_USER":
    case "DELETE_STAFF_USER":
    case "SET_USER_PASSWORD":
      return state // decided by the server (validation, duplicates, audit log); its answer replaces the state
    case "REGISTER":
      return {
        ...state,
        users: [...state.users, action.user],
        guests: [...state.guests, action.guest],
        auditLog: [audit(`Guest account registered: ${action.user.email}`, undefined, action.user.name), ...state.auditLog],
      }
    case "DELETE_USER": {
      const target = state.users.find((u) => u.id === action.id)
      if (!target) return state
      const admins = state.users.filter((u) => u.role === "admin" || u.role === "root-admin")
      if (target.role === "root-admin" || (target.role === "admin" && admins.length <= 1)) return state
      const gid = target.guestId
      const mine = (b: Booking) => !!gid && b.guestId === gid
      // Unpaid bookings are removed; paid ones stay (anonymised) for financial reports.
      const removed = new Set(state.bookings.filter((b) => mine(b) && b.paid <= 0).map((b) => b.id))
      const openStatuses: Booking["status"][] = ["pending", "reserved", "confirmed", "cancellation-requested"]
      const email = target.email.toLowerCase()
      return {
        ...state,
        users: state.users.filter((u) => u.id !== target.id),
        guests: state.guests.filter((g) => g.id !== gid),
        bookings: state.bookings
          .filter((b) => !removed.has(b.id))
          .map((b) => {
            if (!mine(b)) return b
            const { proofImage: _p, proofName: _n, balanceProof, waiver, ...rest } = b
            void _p
            void _n
            return {
              ...rest,
              guestId: "",
              guestName: "Deleted guest",
              email: "",
              phone: undefined,
              status: openStatuses.includes(b.status) ? ("cancelled" as const) : b.status,
              cancelReason: openStatuses.includes(b.status) ? "Account deleted" : b.cancelReason,
              balanceProof: balanceProof ? { ...balanceProof, image: undefined } : undefined,
              waiver: waiver ? { ...waiver, guardian: undefined, healthOther: undefined } : undefined,
            }
          }),
        draft: state.draft.email.toLowerCase() === email ? initialState.draft : state.draft,
        waitlist: (state.waitlist ?? []).filter((w) => !(gid && w.guestId === gid)),
        notices: state.notices.filter((n) => !(gid && n.guestId === gid) && !(n.bookingId && removed.has(n.bookingId))),
        incidents: state.incidents.map((i) => (gid && i.guestId === gid ? { ...i, guestId: undefined, guestName: "Deleted guest" } : i)),
        maintenance: state.maintenance.map((m) => (gid && m.guestId === gid ? { ...m, guestId: undefined, guestName: "Deleted guest" } : m)),
        refunds: state.refunds.map((r) =>
          state.bookings.some((b) => b.id === r.bookingId && mine(b)) ? { ...r, guestName: "Deleted guest" } : r,
        ),
        braceletLog: state.braceletLog.filter((e) => !(e.bookingId && removed.has(e.bookingId))),
        scanHistory: state.scanHistory.filter((s) => ![...removed].some((id) => s.includes(id))),
        auditLog: [
          audit(`Deleted ${target.role} account: ${target.name}`, undefined, action.by),
          ...state.auditLog.filter((e) => !(e.bookingId && removed.has(e.bookingId))),
        ],
      }
    }
    case "JOIN_WAITLIST": {
      const e = action.entry
      const dup = (state.waitlist ?? []).some(
        (w) => w.guestId === e.guestId && w.date === e.date && w.slotId === e.slotId && w.cottageId === e.cottageId && w.status !== "expired",
      )
      if (dup) return state
      return {
        ...state,
        waitlist: [
          ...(state.waitlist ?? []),
          { ...e, id: `WL-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, createdAt: new Date().toISOString(), status: "waiting" },
        ],
      }
    }
    case "LEAVE_WAITLIST":
      return { ...state, waitlist: (state.waitlist ?? []).filter((w) => w.id !== action.id) }
    case "PAY_BALANCE":
    case "COLLECT_PAYMENT": {
      const target = state.bookings.find((b) => b.id === action.id)
      if (!target) return state
      const amount =
        action.type === "PAY_BALANCE" ? balanceOf(target) : action.amount
      const paid = Math.min(target.total, target.paid + amount)
      const full = paid >= target.total
      const stayLive = ["checked-in", "checked-out", "completed"].includes(target.status)
      const method = action.type === "PAY_BALANCE" ? action.method : (action.method ?? "counter")
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === target.id
            ? {
                ...b,
                paid,
                paymentStatus: "verified",
                balanceMethod: action.type === "PAY_BALANCE" ? "online" : (action.method ?? "cash"),
                balanceProof: b.balanceProof ? { ...b.balanceProof, status: "approved" } : undefined,
                receipt: full ? "official" : "reserved",
                status: stayLive
                  ? b.status
                  : full
                    ? "confirmed"
                    : paid >= (b.dueNow ?? 0)
                      ? "reserved"
                      : b.status,
              }
            : b,
        ),
        notices: [
          notice({
            audience: "guest",
            guestId: target.guestId,
            bookingId: target.id,
            message: full
              ? `Balance settled for ${target.id} (${method}). Official receipt issued - paid in full.`
              : `Payment of ${peso(amount)} recorded for ${target.id}. Balance: ${peso(target.total - paid)}.`,
          }),
          ...state.notices,
        ],
        auditLog: [
          audit(`Recorded ${peso(amount)} ${method} payment${full ? " (paid in full, official receipt)" : ""}`, target.id, action.by),
          ...state.auditLog,
        ],
      }
    }
    case "CONFIRM_ATTENDANCE":
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.id ? { ...b, attendanceConfirmed: true } : b,
        ),
        notices: [
          notice({ audience: "staff", bookingId: action.id, message: `${action.id}: guest confirmed attendance (risk score recalculated).` }),
          ...state.notices,
        ],
        auditLog: [audit("Guest confirmed attendance", action.id, "Guest"), ...state.auditLog],
      }
    case "SEND_REMINDER": {
      const target = state.bookings.find((b) => b.id === action.id)
      if (!target) return state
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.id ? { ...b, reminderSentAt: new Date().toISOString() } : b,
        ),
        notices: [
          notice({
            audience: "guest",
            guestId: target.guestId,
            bookingId: target.id,
            message: `Reminder: please confirm your attendance for ${target.id} on ${target.date}. Unconfirmed bookings may be cancelled and the payment kept as a deposit.`,
          }),
          ...state.notices,
        ],
        auditLog: [audit("Sent attendance reminder", action.id, action.by), ...state.auditLog],
      }
    }
    case "BULK_NOTIFY": {
      const targets = state.bookings.filter((b) => action.ids.includes(b.id) && b.guestId)
      if (!targets.length) return state
      return {
        ...state,
        notices: [
          ...targets.map((t) => notice({ audience: "guest", guestId: t.guestId, bookingId: t.id, message: action.message })),
          ...state.notices,
        ],
        auditLog: [audit(`Sent message to ${targets.length} guest(s)`, undefined, action.by), ...state.auditLog],
      }
    }
    case "REQUEST_CANCEL":
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.id
            ? { ...b, status: "cancellation-requested", cancelRequestedAt: new Date().toISOString(), cancelReason: action.reason?.trim() || undefined }
            : b,
        ),
        notices: [
          notice({ audience: "staff", bookingId: action.id, message: `Cancellation requested for ${action.id}. Review in Payments & Refunds.` }),
          ...state.notices,
        ],
        auditLog: [audit("Guest requested cancellation", action.id, "Guest"), ...state.auditLog],
      }
    case "PROCESS_CANCEL": {
      const target = state.bookings.find((b) => b.id === action.id)
      if (!target) return state
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.id ? { ...b, status: "cancelled" } : b,
        ),
        refunds: [
          {
            id: `RF-${Date.now()}`,
            at: new Date().toISOString(),
            bookingId: target.id,
            guestName: target.guestName,
            kind: action.eligible ? "refund" : "deposit-kept",
            amount: action.amount,
            reason: action.reason ?? (action.eligible ? "Cancelled 48h+ before slot" : "Late cancellation / same-day"),
            by: action.by,
          },
          ...state.refunds,
        ],
        notices: [
          notice({
            audience: "guest",
            guestId: target.guestId,
            bookingId: target.id,
            message: action.eligible
              ? `${target.id} cancelled. ${peso(action.amount)} will be refunded within 3-5 business days.`
              : `${target.id} cancelled. Because this was a late request, your ${peso(action.amount)} payment is kept as a deposit (available within 3-5 business days).`,
          }),
          ...state.notices,
        ],
        auditLog: [
          audit(action.eligible ? `Cancelled; refund ${peso(action.amount)} entered` : `Cancelled; ${peso(action.amount)} kept as deposit`, target.id, action.by),
          ...state.auditLog,
        ],
      }
    }
    case "ISSUE_BRACELETS": {
      const target = state.bookings.find((b) => b.id === action.id)
      if (!target) return state
      const existing = (target.bracelets ?? []).filter((x) => !x.voided)
      const missing = Math.max(0, target.guests - existing.length)
      const now = new Date().toISOString()
      const stamp = now.slice(2, 10).replace(/-/g, "")
      const fresh = Array.from({ length: missing }, (_, i) => ({
        serial: `GP${stamp}-${String(Math.floor(1000 + Math.random() * 9000))}${i}`,
        color: braceletColor(target.type, target.slotId),
        issuedAt: now,
      }))
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.id
            ? { ...b, bracelets: [...(b.bracelets ?? []), ...fresh], timeIn: b.timeIn ?? now }
            : b,
        ),
        braceletLog: [
          ...fresh.map((f) => ({ id: `BL-${f.serial}`, at: now, bookingId: target.id, kind: "issued" as const, detail: `${f.serial} - ${f.color}`, by: action.by })),
          ...state.braceletLog,
        ],
        auditLog: [audit(`Issued ${missing} bracelet(s); time in recorded`, target.id, action.by), ...state.auditLog],
      }
    }
    case "SPOT_CHECK": {
      const now = new Date().toISOString()
      const log = {
        id: `BL-${Date.now()}`,
        at: now,
        bookingId: action.bookingId,
        kind: "spot-check" as const,
        detail: `${action.result.toUpperCase()}: ${action.detail}`,
        by: action.by,
      }
      if (action.result !== "transfer")
        return { ...state, braceletLog: [log, ...state.braceletLog] }
      const target = state.bookings.find((b) => b.id === action.bookingId)
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.bookingId
            ? { ...b, bracelets: (b.bracelets ?? []).map((x) => (x.serial === action.serial ? { ...x, voided: true, voidReason: "Suspected transfer" } : x)) }
            : b,
        ),
        braceletLog: [log, ...state.braceletLog],
        incidents: [
          makeIncident(state.incidents.length, {
            guestName: target?.guestName ?? "Unknown guest",
            guestId: target?.guestId,
            bookingId: target?.id,
            type: "Suspected bracelet transfer",
            location: "Pool / cottage entrance",
            description: `Spot check flagged serial ${action.serial ?? "unknown"}. ${action.detail}`,
            source: "staff",
            serious: true,
            escalated: true,
          }),
          ...state.incidents,
        ],
        notices: [notice({ audience: "admin", bookingId: action.bookingId, message: `Suspected bracelet transfer logged for ${action.bookingId ?? "unknown booking"}.` }), ...state.notices],
        auditLog: [audit("Spot check: suspected transfer, serial voided", action.bookingId, action.by), ...state.auditLog],
      }
    }
    case "REPLACE_BRACELET": {
      const target = state.bookings.find((b) => b.id === action.id)
      if (!target) return state
      const now = new Date().toISOString()
      const active = (target.bracelets ?? []).filter((x) => !x.voided)
      const old = active[active.length - 1]
      const serial = `GP${now.slice(2, 10).replace(/-/g, "")}-R${String(Math.floor(100 + Math.random() * 900))}`
      const replacements = state.braceletLog.filter((e) => e.bookingId === target.id && e.kind === "replaced").length + 1
      const color = old?.color ?? braceletColor(target.type, target.slotId)
      const over = replacements > 2
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.id
            ? {
                ...b,
                bracelets: [
                  ...(b.bracelets ?? []).map((x) => (old && x.serial === old.serial ? { ...x, voided: true, voidReason: action.reason } : x)),
                  { serial, color, issuedAt: now },
                ],
              }
            : b,
        ),
        braceletLog: [
          { id: `BL-${serial}`, at: now, bookingId: target.id, kind: "replaced", detail: `${old?.serial ?? "-"} -> ${serial} (${action.reason})`, by: action.by },
          ...state.braceletLog,
        ],
        incidents: over
          ? [
              makeIncident(state.incidents.length, {
                guestName: target.guestName,
                guestId: target.guestId,
                bookingId: target.id,
                type: "Repeated bracelet replacement",
                location: "Front desk",
                description: `Replacement #${replacements} for this booking (${action.reason}).`,
                source: "staff",
                escalated: true,
              }),
              ...state.incidents,
            ]
          : state.incidents,
        notices: over ? [notice({ audience: "admin", bookingId: target.id, message: `${target.id} has needed ${replacements} bracelet replacements.` }), ...state.notices] : state.notices,
        auditLog: [audit(`Replaced bracelet (${action.reason})`, target.id, action.by), ...state.auditLog],
      }
    }
    case "TIME_OUT": {
      const target = state.bookings.find((b) => b.id === action.id)
      if (!target) return state
      const now = new Date().toISOString()
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.id
            ? {
                ...b,
                status: "checked-out",
                timeOut: now,
                braceletReturned: action.returned,
                bracelets: (b.bracelets ?? []).map((x) => (x.voided ? x : { ...x, voided: true, voidReason: action.returned ? "Returned at time out" : "Not returned (lost)" })),
              }
            : b,
        ),
        braceletLog: [
          { id: `BL-OUT-${Date.now()}`, at: now, bookingId: target.id, kind: action.returned ? "time-out" : "not-returned", detail: action.returned ? "Bracelets returned; time out recorded" : "Bracelet not returned (recorded as lost)", by: action.by },
          ...state.braceletLog,
        ],
        auditLog: [audit(`Time out recorded${action.returned ? "" : " (bracelet not returned)"}`, target.id, action.by), ...state.auditLog],
      }
    }
    case "ADD_INCIDENT": {
      const incident = makeIncident(state.incidents.length, action.payload)
      return {
        ...state,
        incidents: [incident, ...state.incidents],
        notices: [notice({ audience: "staff", message: `New incident ${incident.id}: ${incident.type}` }), ...state.notices],
        auditLog: [audit(`Incident ${incident.id} reported: ${incident.type}`, incident.bookingId, incident.source === "guest" ? incident.guestName : "Staff"), ...state.auditLog],
      }
    }
    case "UPDATE_INCIDENT": {
      const target = state.incidents.find((i) => i.id === action.id)
      if (!target) return state
      const now = new Date().toISOString()
      const patch = action.patch
      const closing = patch.status === "resolved" && !target.resolvedAt
      return {
        ...state,
        incidents: state.incidents.map((i) =>
          i.id === action.id
            ? {
                ...i,
                ...patch,
                resolvedAt: closing ? now : patch.status && patch.status !== "resolved" && patch.status !== "cancelled" ? undefined : i.resolvedAt,
                notes: action.note ? [...i.notes, { at: now, by: action.by, text: action.note }] : i.notes,
              }
            : i,
        ),
        notices: [
          ...(action.notify && target.guestId ? [notice({ audience: "guest" as const, guestId: target.guestId, message: `${target.id}: ${action.notify}` })] : []),
          ...(patch.escalated && !target.escalated ? [notice({ audience: "admin" as const, message: `${target.id} escalated to Admin.` })] : []),
          ...state.notices,
        ],
        auditLog: [audit(`Incident ${target.id}: ${action.note ?? patch.status ?? "updated"}`, target.bookingId, action.by), ...state.auditLog],
      }
    }
    case "ADD_MAINT": {
      const request = makeMaint(state.maintenance.length, action.payload)
      return {
        ...state,
        maintenance: [request, ...state.maintenance],
        notices: [notice({ audience: "staff", message: `New maintenance request ${request.id}${request.urgent ? " (URGENT)" : ""}: ${request.concern}` }), ...state.notices],
        auditLog: [audit(`Maintenance ${request.id} requested: ${request.concern}`, request.bookingId, request.guestName), ...state.auditLog],
      }
    }
    case "UPDATE_MAINT": {
      const target = state.maintenance.find((i) => i.id === action.id)
      if (!target) return state
      const now = new Date().toISOString()
      const patch = action.patch
      const closing = patch.status === "done" && !target.resolvedAt
      return {
        ...state,
        maintenance: state.maintenance.map((i) =>
          i.id === action.id
            ? {
                ...i,
                ...patch,
                resolvedAt: closing ? now : patch.status && patch.status !== "done" && patch.status !== "cancelled" ? undefined : i.resolvedAt,
                notes: action.note ? [...i.notes, { at: now, by: action.by, text: action.note }] : i.notes,
              }
            : i,
        ),
        notices: [
          ...(action.notify && target.guestId ? [notice({ audience: "guest" as const, guestId: target.guestId, message: `${target.id}: ${action.notify}` })] : []),
          ...(patch.escalated && !target.escalated ? [notice({ audience: "admin" as const, message: `${target.id} escalated to Admin.` })] : []),
          ...state.notices,
        ],
        auditLog: [audit(`Maintenance ${target.id}: ${action.note ?? patch.status ?? "updated"}`, target.bookingId, action.by), ...state.auditLog],
      }
    }
    case "SAVE_SETTINGS":
      return {
        ...state,
        settings: action.settings,
        auditLog: [
          audit(
            `Booking rules saved (Peak season ${action.settings.peakSeason ? "ON" : "OFF"}; cottage hold ${action.settings.hold.regular.cottageHours}h / peak ${action.settings.hold.peak.cottageHours}h; pool hold ${action.settings.hold.regular.poolHours}h / peak ${action.settings.hold.peak.poolHours}h; cancellation ${action.settings.cancellationHours}h)`,
            undefined,
            action.by,
          ),
          ...state.auditLog,
        ],
      }
    case "POOL_LOG":
      return {
        ...state,
        poolLogs: [
          { id: `PL-${Date.now()}`, at: new Date().toISOString(), ...action.payload },
          ...state.poolLogs,
        ],
        auditLog: [
          audit(`Pool water log: pH ${action.payload.ph}, chlorine ${action.payload.chlorine} ppm`, undefined, action.payload.by),
          ...state.auditLog,
        ],
      }
    case "ASSIGN_SHIFT": {
      if (state.roster.some((r) => r.date === action.date && r.shift === action.shift && r.guardId === action.guardId))
        return state
      return {
        ...state,
        roster: [...state.roster, { id: `R-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, date: action.date, shift: action.shift, guardId: action.guardId }],
        auditLog: [audit(`Assigned lifeguard to ${action.shift} shift on ${action.date}`, undefined, action.by), ...state.auditLog],
      }
    }
    case "UNASSIGN_SHIFT":
      return {
        ...state,
        roster: state.roster.filter((r) => r.id !== action.id),
        auditLog: [audit("Removed lifeguard from shift", undefined, action.by), ...state.auditLog],
      }
    case "SAVE_TARIFF":
      return { ...state, tariff: action.tariff, auditLog: [audit("Updated tariff rates", undefined, action.by), ...state.auditLog] }
    case "SAVE_OPS_CONFIG":
      return { ...state, opsConfig: action.config, auditLog: [audit("Updated lifeguard ratio settings", undefined, action.by), ...state.auditLog] }
    case "SAVE_ADDON": {
      const exists = state.addons.some((a) => a.id === action.addon.id)
      return {
        ...state,
        addons: exists ? state.addons.map((a) => (a.id === action.addon.id ? action.addon : a)) : [...state.addons, action.addon],
        auditLog: [audit(`${exists ? "Updated" : "Added"} add-on: ${action.addon.name}`, undefined, action.by), ...state.auditLog],
      }
    }
    case "ADD_DAMAGE_FEE":
      return {
        ...state,
        guests: state.guests.map((g) =>
          g.id === action.guestId
            ? { ...g, damageFees: [{ id: `DF-${Date.now()}`, at: new Date().toISOString(), settled: false, ...action.fee }, ...(g.damageFees ?? [])] }
            : g,
        ),
        auditLog: [audit(`Logged damage/loss fee: ${action.fee.item} (${action.fee.amount})`, action.fee.bookingId, action.fee.by), ...state.auditLog],
      }
    case "SETTLE_DAMAGE_FEE":
      return {
        ...state,
        guests: state.guests.map((g) =>
          g.id === action.guestId
            ? { ...g, damageFees: (g.damageFees ?? []).map((f) => (f.id === action.feeId ? { ...f, settled: true } : f)) }
            : g,
        ),
        auditLog: [audit("Settled damage/loss fee", undefined, action.by), ...state.auditLog],
      }
    case "REMOVE_BLACKOUT":
      return {
        ...state,
        blackouts: state.blackouts.filter((b) => b.id !== action.id),
        auditLog: [audit("Removed closure / maintenance lockout", undefined, action.by), ...state.auditLog],
      }
    case "SET_BLACKOUT_KIND":
      return { ...state, blackouts: state.blackouts.map((b) => (b.id === action.id ? { ...b, kind: action.kind } : b)) }
    case "BILL_OVERTIME":
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === action.id
            ? { ...b, overtime: action.overtime, total: b.total - (b.overtime?.fee ?? 0) + action.overtime.fee }
            : b,
        ),
        auditLog: [audit(`Overtime billed: ${action.overtime.billedHours}h = ${action.overtime.fee}`, action.id, action.overtime.by), ...state.auditLog],
      }
    case "EXPIRY_ALERT": {
      const target = state.bookings.find((b) => b.id === action.id)
      if (!target || target.expiryAlertSentAt) return state
      const now = new Date().toISOString()
      return {
        ...state,
        bookings: state.bookings.map((b) => (b.id === action.id ? { ...b, expiryAlertSentAt: now } : b)),
        notices: [
          { id: `N-${Date.now()}-g`, at: now, audience: "guest", guestId: target.guestId, bookingId: target.id, message: `Your session (${target.id}) ends soon. Please wrap up and check out to avoid overtime charges.` },
          { id: `N-${Date.now()}-s`, at: now, audience: "staff", bookingId: target.id, message: `${target.guestName}'s session (${target.id}) is about to expire.` },
          ...state.notices,
        ],
      }
    }
    case "QUEUE_SYNC":
      return { ...state, syncQueue: [action.item, ...state.syncQueue] }
    case "SYNC_QUEUE": {
      const pending = state.syncQueue.filter((s) => !s.syncedAt)
      if (pending.length === 0) return state
      const at = new Date().toISOString()
      return {
        ...state,
        syncQueue: state.syncQueue.map((s) => (s.syncedAt ? s : { ...s, syncedAt: at })),
        auditLog: [
          ...pending.map((s) => audit(`Offline check-in synced (done ${new Date(s.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`, s.bookingId, s.by)),
          ...state.auditLog,
        ],
      }
    }
    case "SAVE_SHIFT":
      return {
        ...state,
        shiftReports: [action.report, ...state.shiftReports],
        auditLog: [
          audit(`Closed shift: counted ${peso(action.report.countedCash)}, variance ${peso(action.report.variance)}`, undefined, action.report.by),
          ...state.auditLog,
        ],
      }
    case "SET_QR_TOKEN":
      return { ...state, bookings: state.bookings.map((b) => (b.id === action.id ? { ...b, qrToken: action.token } : b)) }
    case "WEATHER_CANCEL": {
      const hit = state.bookings.filter(
        (b) => b.date === action.date && (!action.slotId || b.slotId === action.slotId) && ["pending", "reserved", "confirmed"].includes(b.status) && (!action.ids || action.ids.includes(b.id)),
      )
      const now = new Date().toISOString()
      const ids = new Set(hit.map((b) => b.id))
      const refunds = action.mode === "refund"
        ? hit.filter((b) => b.paid > 0).map((b) => ({ id: `RF-${b.id}-${Date.now()}`, at: now, bookingId: b.id, guestName: b.guestName, kind: "refund" as const, amount: b.paid, reason: "Inclement weather cancellation", by: action.by }))
        : []
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          !ids.has(b.id)
            ? b
            : action.mode === "refund"
              ? { ...b, status: "cancelled", cancelReason: "Inclement weather", paid: 0 }
              : { ...b, date: action.newDate ?? b.date },
        ),
        refunds: [...refunds, ...state.refunds],
        notices: [
          ...hit.map((b, i) => ({ id: `N-${Date.now()}-${i}`, at: now, audience: "guest" as const, guestId: b.guestId, bookingId: b.id, message: action.mode === "refund" ? `Weather advisory: your ${b.date} booking ${b.id} was cancelled and ${b.paid > 0 ? "fully refunded" : "no payment was due"}.` : `Weather advisory: your booking ${b.id} was moved to ${action.newDate}. If that date doesn't work for you, contact the front desk and we will refund you in full.` })),
          ...state.notices,
        ],
        blackouts: [{ id: `BLK-${Date.now()}`, date: action.date, slotId: action.slotId, reason: "Inclement weather", kind: "weather" as const }, ...state.blackouts],
        auditLog: [audit(`Weather protocol (${action.mode === "refund" ? "refund" : "reschedule"}) applied to ${hit.length} booking(s) on ${action.date}`, undefined, action.by), ...state.auditLog],
      }
    }
    case "TICK": {
      const now = Date.now()
      const slotHours: Record<string, number> = {
        morning: 8,
        afternoon: 18,
        evening: 14,
        "day-tour": 8,
        "night-swim": 18,
        "room-stay": 14,
        event: 8,
      }
      const expired = (b: Booking) =>
        b.status === "pending" &&
        b.paymentStatus === "unpaid" &&
        !!b.paymentDeadline &&
        new Date(b.paymentDeadline).getTime() <= now
      const warn = (b: Booking) =>
        b.status === "pending" &&
        b.paymentStatus === "unpaid" &&
        !b.warnedAt &&
        !!b.paymentDeadline &&
        new Date(b.paymentDeadline).getTime() - now <= 15 * 60_000 &&
        new Date(b.paymentDeadline).getTime() > now
      const remind = (b: Booking) =>
        !b.reminderSentAt &&
        !b.attendanceConfirmed &&
        ["confirmed", "reserved"].includes(b.status) &&
        needsConfirmation(b, state.settings) &&
        hoursUntil(b) <= state.settings.confirmationHours &&
        hoursUntil(b) > 0
      const noShow = (b: Booking) => {
        if (!["confirmed", "reserved"].includes(b.status)) return false
        const hour = slotHours[b.slotId]
        if (hour === undefined) return false
        const grace = new Date(`${b.date}T00:00:00`)
        grace.setHours(hour, 30, 0, 0)
        return grace.getTime() <= now
      }
      const expiredList = state.bookings.filter(expired)
      const warnList = state.bookings.filter(warn)
      const remindList = state.bookings.filter(remind)
      const noShowList = state.bookings.filter(noShow)
      if (!expiredList.length && !warnList.length && !remindList.length && !noShowList.length && !state.holds.some((h) => new Date(h.expiresAt).getTime() <= now))
        return state
      const stamp = new Date().toISOString()
      return {
        ...state,
        holds: state.holds.filter((hold) => new Date(hold.expiresAt).getTime() > now),
        bookings: state.bookings.map((b) =>
          expired(b)
            ? { ...b, status: "expired" }
            : noShow(b)
              ? { ...b, status: "no-show" }
              : remind(b)
                ? { ...b, reminderSentAt: stamp }
                : warn(b)
                  ? { ...b, warnedAt: stamp }
                  : b,
        ),
        notices: [
          ...expiredList.map((b) => notice({ audience: "guest", guestId: b.guestId, bookingId: b.id, message: `Hold expired for ${b.id}. The slot is available to others again.` })),
          ...warnList.map((b) => notice({ audience: "guest", guestId: b.guestId, bookingId: b.id, message: `Your hold for ${b.id} ends soon. Pay now to keep the slot.` })),
          ...remindList.map((b) => notice({ audience: "guest", guestId: b.guestId, bookingId: b.id, message: `Please confirm your attendance for ${b.id} (${b.date}) within ${state.settings.confirmationHours} hours of the slot.` })),
          ...state.notices,
        ],
        auditLog: [
          ...expiredList.map((b) => audit("Hold expired; slot released", b.id, "System")),
          ...noShowList.map((b) => audit("Marked no-show after 30-minute grace period", b.id, "System")),
          ...remindList.map((b) => audit("Auto-sent attendance reminder", b.id, "System")),
          ...state.auditLog,
        ],
      }
    }
    case "HYDRATE":
      return action.payload
    case "RESET":
      return initialState
  }
}

type AuthResult = { ok: true, user: User } | { ok: false, error: string }

type DispatchOptions = {
  /** Do not pop up the server's error message (the caller shows it itself). */
  silent?: boolean
}

type Store = {
  state: AppState
  /** Applies the change on screen at once, sends it to the server, then shows the server's saved result. */
  dispatch: (action: Action, options?: DispatchOptions) => Promise<ServerResult>
  currentUser: User | null
  login: (email: string, password: string) => Promise<AuthResult>
  register: (input: { name: string, email: string, phone: string, password: string, birthdate?: string }) => Promise<AuthResult>
  logout: () => void
  /** Self-service account erasure (same rules as the admin delete). */
  deleteMyAccount: () => Promise<{ ok: true } | { ok: false, error: string }>
  todayBookings: Booking[]
  headcount: number
}

// Keep one context identity during Vite HMR. Without this, a lazy route can
// temporarily retain the previous module's context while the provider uses the
// refreshed module, making a correctly wrapped component appear unwrapped.
const contextGlobal = globalThis as typeof globalThis & {
  __tampisawStoreContext?: Context<Store | null>
}
const StoreContext =
  contextGlobal.__tampisawStoreContext ?? createContext<Store | null>(null)
contextGlobal.__tampisawStoreContext = StoreContext

/** Server data over the app defaults; lists the server did not send stay empty (never demo data). */
function mergeServer(raw: Partial<AppState>): AppState {
  const merged = { ...initialState, ...raw } as AppState
  for (const key of Object.keys(initialState) as (keyof AppState)[]) {
    if (Array.isArray(initialState[key]) && !Array.isArray(merged[key]))
      (merged as Record<string, unknown>)[key] = []
  }
  merged.draft = { ...initialState.draft, ...(raw.draft ?? {}) }
  return merged
}

const blankState = (): AppState => ({ ...initialState, users: [], guests: [], bookings: [] })

const REFRESH_MS = 15_000

export function TampisawProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, blankState)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "offline">("loading")
  const pending = useRef(0)
  const epoch = useRef(0)
  const chain = useRef<Promise<unknown>>(Promise.resolve())

  const apply = useCallback((snap: ServerSnapshot) => {
    rawDispatch({ type: "HYDRATE", payload: mergeServer(snap.state) })
    setCurrentUser(snap.user ? (snap.user as User) : null)
    setStatus("ready")
  }, [])

  /** Reads the latest data from the server (skipped while a change is still being saved). */
  const refresh = useCallback(async (force = false) => {
    if (!force && pending.current > 0) return
    const startedAt = epoch.current
    try {
      const snap = await apiGetState()
      if (force || (pending.current === 0 && epoch.current === startedAt)) apply(snap)
    } catch {
      setStatus((s) => (s === "loading" ? "offline" : s))
    }
  }, [apply])

  useEffect(() => {
    void refresh(true)
    const timer = window.setInterval(() => void refresh(), REFRESH_MS)
    const onVisible = () => document.visibilityState === "visible" && void refresh()
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [refresh])

  const dispatch: Store["dispatch"] = useCallback((action, options) => {
    // Wizard draft and housekeeping never need the server.
    if (action.type === "DRAFT" || action.type === "HYDRATE" || action.type === "RESET") {
      rawDispatch(action)
      return Promise.resolve({ ok: true })
    }
    if (action.type === "TICK") {
      void refresh()
      return Promise.resolve({ ok: true })
    }
    epoch.current++
    pending.current++
    rawDispatch(action) // show the change immediately; the server's answer replaces it below
    const run = async (): Promise<ServerResult> => {
      try {
        const res = await apiDispatch(action)
        pending.current--
        if (pending.current === 0) apply(res)
        if (!res.ok && res.error && !options?.silent) window.alert(res.error)
        return { ok: res.ok, error: res.error, bookingId: res.bookingId }
      } catch (e) {
        pending.current--
        const message = e instanceof ServerUnreachable ? e.message : e instanceof Error ? e.message : "Something went wrong."
        if (pending.current === 0) void refresh(true)
        if (!options?.silent) window.alert(message)
        return { ok: false, error: message }
      }
    }
    const next = chain.current.then(run)
    chain.current = next
    return next
  }, [apply, refresh])

  const login: Store["login"] = async (email, password) => {
    try {
      const res = await apiPost<{ ok: boolean; error?: string; user?: User }>("/api/auth/login", { email, password })
      if (!res.ok || !res.user) return { ok: false, error: res.error ?? "Access denied: wrong email or password." }
      await refresh(true)
      return { ok: true, user: res.user }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not sign in." }
    }
  }

  const register: Store["register"] = async (input) => {
    const name = input.name.trim()
    if (!name || !isValidEmail(input.email) || !isValidPhone(input.phone) || passwordProblems(input.password).length)
      return { ok: false, error: "Enter your name, a valid email, a valid mobile number and a password that meets all the requirements." }
    try {
      const res = await apiPost<{ ok: boolean; error?: string; user?: User }>("/api/auth/register", { ...input, name })
      if (!res.ok || !res.user) return { ok: false, error: res.error ?? "Could not create the account." }
      return { ok: true, user: res.user }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not create the account." }
    }
  }

  const logout = () => {
    setCurrentUser(null)
    void apiPost("/api/auth/logout")
      .catch(() => undefined)
      .then(() => refresh(true))
  }

  const deleteMyAccount: Store["deleteMyAccount"] = async () => {
    if (!currentUser || currentUser.role !== "guest") return { ok: false, error: "Only guest accounts can be deleted here." }
    const live = ["pending", "reserved", "confirmed", "checked-in", "cancellation-requested"]
    const blocking = state.bookings.filter(
      (b) => b.guestId === currentUser.guestId && b.paid > 0 && live.includes(b.status) && b.date >= new Date().toISOString().slice(0, 10),
    )
    if (blocking.length)
      return {
        ok: false,
        error: `You still have ${blocking.length} upcoming paid booking${blocking.length === 1 ? "" : "s"} (${blocking.map((b) => b.id).join(", ")}). Cancel and settle any refund first, then delete your account.`,
      }
    const res = await dispatch({ type: "DELETE_USER", id: currentUser.id, by: "Guest (self-service)" }, { silent: true })
    if (!res.ok) return { ok: false, error: res.error ?? "The account could not be deleted." }
    return { ok: true }
  }

  const value = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const todayBookings = state.bookings.filter(
      (booking) => booking.date === today && booking.status !== "cancelled",
    )
    const headcount = todayBookings
      .filter((booking) => booking.status === "checked-in")
      .reduce((sum, booking) => sum + booking.guests, 0)
    return { state, dispatch, todayBookings, headcount, currentUser, login, register, logout, deleteMyAccount }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, currentUser, dispatch])

  if (status !== "ready")
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        {status === "loading" ? (
          <p className="text-sm font-semibold text-slate-500">Loading Tampisaw…</p>
        ) : (
          <div className="grid max-w-sm gap-3">
            <p className="text-lg font-extrabold">Cannot reach the Tampisaw server</p>
            <p className="text-sm text-slate-500">Make sure the application is running (and its database is reachable), then try again.</p>
            <button type="button" className="rounded-xl bg-aqua-600 px-4 py-2 text-sm font-bold text-white" onClick={() => { setStatus("loading"); void refresh(true) }}>
              Try again
            </button>
          </div>
        )}
      </div>
    )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useTampisaw() {
  const context = useContext(StoreContext)
  if (!context)
    throw new Error("useTampisaw must be used inside TampisawProvider")
  return context
}
