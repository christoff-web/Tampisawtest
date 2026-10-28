export type Risk = "low" | "medium" | "high"
export type BookingStatus =
  | "pending"
  | "reserved"
  | "confirmed"
  | "checked-in"
  | "checked-out"
  | "completed"
  | "cancellation-requested"
  | "cancelled"
  | "expired"
  | "no-show"
export type PaymentStatus = "unpaid" | "submitted" | "verified" | "rejected"

export type Slot = {
  id: string
  label: string
  time: string
  capacity: number
  active: boolean
}

export type Cottage = {
  id: string
  name: string
  capacity: number
  price: number
  status: "available" | "maintenance"
  image: string
  amenities: string[]
  kind: "cottage" | "room" | "event"
  units?: number
}

export type Guest = {
  id: string
  name: string
  email: string
  phone: string
  visits: number
  cancellations: number
  noShows: number
  damageFees?: DamageFee[]
  lastVisit: string
  risk: Risk
}

export type Booking = {
  id: string
  guestId: string
  guestName: string
  email: string
  date: string
  slotId: string
  guests: number
  type: "pool" | "cottage" | "room" | "event"
  cottageId?: string
  /** Rented hours for cottage stays; never above the tariff duration cap. */
  cottageHours?: number
  status: BookingStatus
  risk: Risk
  paid: number
  total: number
  checkedInAt?: string
  phone?: string
  adults?: number
  children?: number
  discounts?: number
  paymentStatus: PaymentStatus
  staffApproval?: { by: string; at: string }
  paymentMethod?: "cash" | "qr"
  /** Guest's intended arrival (cash reservations): receptionist reviews, admin confirms. */
  arrivalDate?: string
  arrivalTime?: string
  proofName?: string
  proofImage?: string
  balanceProof?: { name: string; image?: string; submittedAt: string; status: "submitted" | "rejected" | "approved" }
  balanceMethod?: "cash" | "gcash" | "online"
  paymentDeadline?: string
  source?: "online" | "walk-in"
  eventStart?: string
  createdAt?: string
  /** Amount required now: full for pool, downpayment % for cottage/room/event */
  dueNow?: number
  receipt?: "none" | "reserved" | "official"
  attendanceConfirmed?: boolean
  reminderSentAt?: string
  /** Set once the day-before in-app reminder was created. */
  dayBeforeReminderAt?: string
  warnedAt?: string
  cancelRequestedAt?: string
  timeIn?: string
  timeOut?: string
  braceletReturned?: boolean
  bracelets?: Bracelet[]
  walkInOption?: "acquire-now" | "reserve" | "appointment"
  mix?: GuestMix
  addons?: BookingAddon[]
  addonDeposit?: number
  waiver?: Waiver
  qrToken?: string
  checkedInAtISO?: string
  sessionMinutes?: number
  expiryAlertSentAt?: string
  overtime?: OvertimeCharge
  cancelReason?: string
  /** What the guest chose to pay when booking: the down payment or everything. Pool entry is always full. */
  paymentOption?: "partial" | "full"
  /** Soft delete: archived bookings leave the working lists and never block availability. */
  archived?: boolean
  archivedAt?: string
  archivedBy?: string
}

export type GuestKind = "adult" | "child" | "senior" | "pwd"
export type GuestMix = Record<GuestKind, number>
export type SessionTier = "day" | "night" | "overnight"

export type Waiver = {
  acceptedAt: string
  version: string
  rules: string[]
  health: Record<string, boolean>
  healthOther?: string
  flagged: boolean
  dpaConsent: boolean
  guardian?: {
    name: string
    relationship: string
    contact: string
    signature: string
    minors: number
    signedAt: string
  }
  hash: string
}

export type BookingAddon = {
  id: string
  name: string
  qty: number
  price: number
  deposit: number
}

export type Addon = {
  id: string
  name: string
  description: string
  price: number
  unit: string
  dailyCap: number
  deposit: number
  image: string
  active: boolean
}

export type DamageFee = {
  id: string
  at: string
  bookingId?: string
  item: string
  amount: number
  note: string
  by: string
  settled: boolean
}

export type OvertimeCharge = {
  minutesOver: number
  billedHours: number
  fee: number
  at: string
  by: string
}

export type Tariff = {
  rates: Record<SessionTier, Record<GuestKind, number>>
  statutoryDiscountPct: number
  overtime: {
    perGuestHour: Record<SessionTier, number>
    perCottageHour: Record<SessionTier, number>
    graceMinutes: number
    blockMinutes: number
  }
  durationCapHours: { dayCottage: number; nightCottage: number }
  expiryAlertMinutes: number
}

export type OpsConfig = {
  guestsPerLifeguard: number
  minLifeguardsPerShift: number
}

export type LifeguardShiftName = "morning" | "afternoon" | "night"
export type Lifeguard = { id: string; name: string; active: boolean }
export type RosterEntry = {
  id: string
  date: string
  shift: LifeguardShiftName
  guardId: string
}

export type PoolLog = {
  id: string
  at: string
  ph: number
  chlorine: number
  backwash: boolean
  cleaned: boolean
  notes: string
  by: string
}

export type Bracelet = {
  serial: string
  color: string
  issuedAt: string
  voided?: boolean
  voidReason?: string
}

export type BraceletEvent = {
  id: string
  at: string
  bookingId?: string
  kind: "issued" | "spot-check" | "replaced" | "voided" | "time-out" | "not-returned"
  detail: string
  by: string
}

export type Note = { at: string; by: string; text: string }

export type IncidentStatus = "requested" | "in-progress" | "resolved" | "cancelled"
export type Incident = {
  id: string
  guestId?: string
  guestName: string
  bookingId?: string
  type: string
  location: string
  description: string
  status: IncidentStatus
  serious: boolean
  escalated: boolean
  guestConfirmed?: boolean
  adminReview?: string
  source: "guest" | "staff" | "system"
  createdAt: string
  resolvedAt?: string
  notes: Note[]
}

export type MaintenanceStatus = "requested" | "on-the-way" | "done" | "cancelled"
export type MaintenanceRequest = {
  id: string
  guestId?: string
  guestName: string
  bookingId?: string
  area: string
  concern: string
  details: string
  urgent: boolean
  status: MaintenanceStatus
  escalated: boolean
  assignedTo?: string
  guestConfirmed?: boolean
  adminReview?: string
  createdAt: string
  resolvedAt?: string
  notes: Note[]
}

export type Notice = {
  id: string
  at: string
  audience: "guest" | "staff" | "admin"
  guestId?: string
  bookingId?: string
  message: string
}

export type Refund = {
  id: string
  at: string
  bookingId: string
  guestName: string
  kind: "refund" | "deposit-kept"
  amount: number
  reason: string
  by: string
}

export type RiskRules = {
  previousNoShow: number
  previousCancellation: number
  lateBooking: number
  noConfirmation: number
  largeGroup: number
  mediumFrom: number
  highFrom: number
}

export type SocialLink = {
  platform: "facebook" | "instagram" | "tiktok" | "x" | "youtube" | "linkedin" | "website" | "other"
  label: string
  url: string
  active: boolean
}

export type ResortContact = {
  resortName: string
  facebookName: string
  facebookUrl: string
  phone: string
  email: string
  instagramUrl: string
  tiktokUrl: string
  socialLinks: SocialLink[]
}

export type Settings = {
  peakSeason: boolean
  hold: {
    regular: { cottageHours: number; poolHours: number }
    peak: { cottageHours: number; poolHours: number }
  }
  onlinePaymentMinutes: number
  confirmationHours: number
  cancellationHours: number
  downpaymentPct: number
  riskRules: RiskRules
  contact: ResortContact
}

export type Role = "guest" | "receptionist" | "admin" | "root-admin"
export type User = {
  id: string
  name: string
  email: string
  phone: string
  role: Role
  guestId?: string
  birthdate?: string
  /** Archived accounts keep their history but cannot sign in. */
  archived?: boolean
  createdAt?: string
  createdBy?: string
}

export type DraftBooking = {
  date: string
  slotId: string
  guests: number
  type: "pool" | "cottage" | "room" | "event"
  cottageId?: string
  cottageHours?: number
  name: string
  email: string
  phone: string
  adults: number
  children: number
  discounts: number
  eventStart?: string
  mix?: GuestMix
  addons?: BookingAddon[]
  waiver?: Waiver
  paymentOption?: "partial" | "full"
}

export type Hold = {
  id: string
  date: string
  slotId: string
  guests: number
  cottageId?: string
  eventStart?: string
  guestId?: string
  expiresAt: string
}

export type AuditEvent = {
  id: string
  at: string
  actor: string
  action: string
  bookingId?: string
  /** guest, receptionist, admin, root-admin or system (older entries have none). */
  role?: string
}

export type StaffAccount = {
  id: string
  name: string
  role: "admin" | "gate"
  active: boolean
}

export type Blackout = {
  id: string
  date: string
  slotId?: string
  reason: string
  kind?: "closure" | "maintenance" | "weather"
}

export type Policy = { id: string; title: string; body: string }

export type SyncItem = {
  id: string
  bookingId: string
  guestName: string
  kind: "check-in"
  at: string
  by: string
  syncedAt?: string
}

export type ShiftReport = {
  id: string
  closedAt: string
  by: string
  openingFloat: number
  expectedCash: number
  countedCash: number
  variance: number
  denominations: Record<string, number>
  note: string
}

export type WaitlistEntry = {
  id: string
  guestId: string
  name: string
  phone: string
  date: string
  slotId: string
  cottageId?: string
  guests: number
  createdAt: string
  status: "waiting" | "notified" | "expired"
  notifiedAt?: string
  /** Notified guests have until this time (24h) to book before the next person is told. */
  expiresAt?: string
}

export type AppState = {
  policies: Policy[]
  bookings: Booking[]
  cottages: Cottage[]
  slots: Slot[]
  guests: Guest[]
  draft: DraftBooking
  holds: Hold[]
  auditLog: AuditEvent[]
  staff: StaffAccount[]
  blackouts: Blackout[]
  scanHistory: string[]
  users: User[]
  incidents: Incident[]
  maintenance: MaintenanceRequest[]
  notices: Notice[]
  refunds: Refund[]
  braceletLog: BraceletEvent[]
  settings: Settings
  tariff: Tariff
  addons: Addon[]
  opsConfig: OpsConfig
  lifeguards: Lifeguard[]
  roster: RosterEntry[]
  poolLogs: PoolLog[]
  waitlist: WaitlistEntry[]
  syncQueue: SyncItem[]
  shiftReports: ShiftReport[]
}
