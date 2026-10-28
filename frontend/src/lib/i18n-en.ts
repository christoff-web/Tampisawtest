import { enStaffShell } from "./i18n/en-staff-shell"
import { enStaffDesk } from "./i18n/en-staff-desk"
import { enStaffQr } from "./i18n/en-staff-qr"
import { enStaffWalkin } from "./i18n/en-staff-walkin"
import { enStaffOps } from "./i18n/en-staff-ops"
import { enShell } from "./i18n/en-shell"
import { enLanding } from "./i18n/en-landing"
import { enBooking } from "./i18n/en-booking"
import { enCheckout } from "./i18n/en-checkout"
import { enHelp } from "./i18n/en-help"

export const en = { ...enShell, ...enLanding, ...enBooking, ...enCheckout, ...enHelp, ...enStaffShell, ...enStaffDesk, ...enStaffQr, ...enStaffWalkin, ...enStaffOps } as const
export type TKey = keyof typeof en
