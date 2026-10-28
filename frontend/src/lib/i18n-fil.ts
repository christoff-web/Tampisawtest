import { filStaffShell } from "./i18n/fil-staff-shell"
import { filStaffDesk } from "./i18n/fil-staff-desk"
import { filStaffQr } from "./i18n/fil-staff-qr"
import { filStaffWalkin } from "./i18n/fil-staff-walkin"
import { filStaffOps } from "./i18n/fil-staff-ops"
import type { TKey } from "./i18n-en"
import { filShell } from "./i18n/fil-shell"
import { filLanding } from "./i18n/fil-landing"
import { filBooking } from "./i18n/fil-booking"
import { filCheckout } from "./i18n/fil-checkout"
import { filHelp } from "./i18n/fil-help"

// Typed as Record<TKey, string>: a missing Filipino key is a compile error.
export const fil: Record<TKey, string> = { ...filShell, ...filLanding, ...filBooking, ...filCheckout, ...filHelp, ...filStaffShell, ...filStaffDesk, ...filStaffQr, ...filStaffWalkin, ...filStaffOps }
