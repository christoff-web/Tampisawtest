import { lazy, Suspense, useEffect, useRef } from "react"
import { Navigate, Route, Routes, useLocation, createHashRouter, RouterProvider } from "react-router-dom"
import { TampisawProvider } from "./store"
import { PageSkeleton } from "./components/ui"
import { RequireRole } from "./components/guard"
import type { Role } from "./types"

const LandingPage = lazy(() =>
  import("./pages/guest").then((module) => ({ default: module.LandingPage })),
)
const AuthPage = lazy(() =>
  import("./pages/guest").then((module) => ({ default: module.AuthPage })),
)
const BookingPage = lazy(() =>
  import("./pages/guest").then((module) => ({ default: module.BookingPage })),
)
const CheckoutPage = lazy(() =>
  import("./pages/guest").then((module) => ({ default: module.CheckoutPage })),
)
const ConfirmationPage = lazy(() =>
  import("./pages/guest").then((module) => ({
    default: module.ConfirmationPage,
  })),
)
const MyBookingsPage = lazy(() =>
  import("./pages/guest").then((module) => ({
    default: module.MyBookingsPage,
  })),
)
const l = <T extends string>(
  loader: () => Promise<Record<T, React.ComponentType<any>>>,
  name: T,
) => lazy(() => loader().then((m) => ({ default: m[name] })))

const STAFF: Role[] = ["receptionist", "admin"]
const ADMIN: Role[] = ["admin"]
const ROOT: Role[] = ["root-admin"]
const PoolLogPage = l(() => import("./pages/ops-staff"), "PoolLogPage")
const AddonsOpsPage = l(() => import("./pages/ops-staff"), "AddonsOpsPage")
const TariffsPage = l(() => import("./pages/ops-admin"), "TariffsPage")
const WeatherPage = l(() => import("./pages/ops-admin"), "WeatherPage")
const StaffDashboard = l(() => import("./pages/staff"), "StaffDashboard")
const AppointmentsPage = l(() => import("./pages/staff"), "AppointmentsPage")
const CottageReservationsPage = l(() => import("./pages/staff"), "CottageReservationsPage")
const QrVerificationPage = l(() => import("./pages/staff"), "QrVerificationPage")
const ShiftPage = l(() => import("./pages/shift"), "ShiftPage")
const AdminShiftsPage = l(() => import("./pages/shift"), "AdminShiftsPage")
const WalkInPage = l(() => import("./pages/staff"), "WalkInPage")
const PaymentsRefundsPage = l(() => import("./pages/staff-ops"), "PaymentsRefundsPage")
const BraceletsPage = l(() => import("./pages/staff-ops"), "BraceletsPage")
const IncidentsPage = l(() => import("./pages/staff-ops"), "IncidentsPage")
const MaintenancePage = l(() => import("./pages/staff-ops"), "MaintenancePage")
const AdminIncidentsPage = l(() => import("./pages/staff-ops"), "AdminIncidentsPage")
const AdminMaintenancePage = l(() => import("./pages/staff-ops"), "AdminMaintenancePage")
const RulesPoliciesHub = l(() => import("./components/admin-hubs"), "RulesPoliciesHub")
const ReportsHub = l(() => import("./components/admin-hubs"), "ReportsHub")
const PrivacyPage = l(() => import("./pages/guest-privacy"), "PrivacyPage")
const GuestHelpPage = l(() => import("./pages/guest-help"), "GuestHelpPage")
const AdminDashboard = lazy(() =>
  import("./pages/admin").then((module) => ({
    default: module.AdminDashboard,
  })),
)
const BookingsAdmin = lazy(() =>
  import("./pages/admin").then((module) => ({ default: module.BookingsAdmin })),
)
const CapacityAdmin = lazy(() =>
  import("./pages/admin").then((module) => ({ default: module.CapacityAdmin })),
)
const CottagesAdmin = lazy(() =>
  import("./pages/admin").then((module) => ({ default: module.CottagesAdmin })),
)
const GuestsAdmin = lazy(() =>
  import("./pages/admin").then((module) => ({ default: module.GuestsAdmin })),
)
const RootConsole = l(() => import("./pages/root"), "RootConsole")
const ForgotPasswordPage = l(() => import("./pages/auth-recovery"), "ForgotPasswordPage")

/**
 * Pages that are really tabs of one screen share a key, so switching between them does not rebuild the page
 * (which used to collapse the page height and throw the reader back to the top).
 */
const PRELOAD: (() => Promise<unknown>)[] = [
  () => import("./pages/admin"),
  () => import("./pages/auth-recovery"),
  () => import("./pages/guest"),
  () => import("./pages/guest-help"),
  () => import("./pages/guest-privacy"),
  () => import("./pages/ops-admin"),
  () => import("./pages/ops-staff"),
  () => import("./pages/root"),
  () => import("./pages/shift"),
  () => import("./pages/staff"),
  () => import("./pages/staff-ops"),
]

const sectionKey = (pathname: string) =>
  ["/admin/reports", "/admin/forecast", "/admin/no-show"].includes(pathname) ? "/admin/reports" : pathname

function PageTransition({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const key = sectionKey(pathname)
  const last = useRef(key)
  // Fetch the other screens in the background once the browser is idle, so opening one never shows a blank "loading" flash.
  useEffect(() => {
    const warm = () => PRELOAD.forEach((load) => void load().catch(() => undefined))
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    const id = idle ? idle(warm) : window.setTimeout(warm, 1500)
    return () => {
      if (!idle) window.clearTimeout(id)
    }
  }, [])
  // A different screen starts at the top (instantly, no smooth scrolling); a tab of the same screen keeps the reader's place.
  useEffect(() => {
    if (last.current !== key) {
      last.current = key
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior })
    }
  }, [key])
  // No fade-in on every page change: that made the whole screen blink each time a tab or link was clicked.
  return <div key={key}>{children}</div>
}

function Shell() {
  return (
    <>
      <TampisawProvider>
        <Suspense
          fallback={<PageSkeleton />}
        >
          <PageTransition>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/signup" element={<AuthPage mode="signup" />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/root" element={<RequireRole roles={ROOT}><RootConsole /></RequireRole>} />
            <Route path="/book" element={<BookingPage />} />
            <Route path="/checkout" element={<RequireRole roles={["guest"]}><CheckoutPage /></RequireRole>} />
            <Route path="/confirmation/:bookingId" element={<RequireRole roles={["guest"]}><ConfirmationPage /></RequireRole>} />
            <Route path="/my-bookings" element={<RequireRole roles={["guest"]}><MyBookingsPage /></RequireRole>} />
            <Route path="/help" element={<RequireRole roles={["guest"]}><GuestHelpPage /></RequireRole>} />
            <Route path="/privacy" element={<RequireRole roles={["guest"]}><PrivacyPage /></RequireRole>} />
            <Route path="/staff" element={<RequireRole roles={STAFF}><StaffDashboard /></RequireRole>} />
            <Route path="/staff/appointments" element={<RequireRole roles={STAFF}><AppointmentsPage /></RequireRole>} />
            <Route path="/staff/cottages" element={<RequireRole roles={STAFF}><CottageReservationsPage /></RequireRole>} />
            <Route path="/staff/qr" element={<RequireRole roles={STAFF}><QrVerificationPage /></RequireRole>} />
            <Route path="/staff/walk-in" element={<RequireRole roles={STAFF}><WalkInPage /></RequireRole>} />
            <Route path="/staff/shift" element={<RequireRole roles={STAFF}><ShiftPage /></RequireRole>} />
            <Route path="/admin/shifts" element={<RequireRole roles={ADMIN}><AdminShiftsPage /></RequireRole>} />
            <Route path="/staff/payments" element={<RequireRole roles={STAFF}><PaymentsRefundsPage /></RequireRole>} />
            <Route path="/staff/bracelets" element={<RequireRole roles={STAFF}><BraceletsPage /></RequireRole>} />
            <Route path="/staff/incidents" element={<RequireRole roles={STAFF}><IncidentsPage /></RequireRole>} />
            <Route path="/staff/maintenance" element={<RequireRole roles={STAFF}><MaintenancePage /></RequireRole>} />
            <Route path="/admin/pool-log" element={<RequireRole roles={ADMIN}><PoolLogPage /></RequireRole>} />
            <Route path="/staff/pool-log" element={<RequireRole roles={ADMIN}><Navigate to="/admin/pool-log" replace /></RequireRole>} />
            <Route path="/staff/addons" element={<RequireRole roles={STAFF}><AddonsOpsPage /></RequireRole>} />
            <Route path="/admin/tariffs" element={<RequireRole roles={ADMIN}><TariffsPage /></RequireRole>} />
            <Route path="/admin/weather" element={<RequireRole roles={ADMIN}><WeatherPage /></RequireRole>} />
            <Route path="/admin" element={<RequireRole roles={ADMIN}><AdminDashboard /></RequireRole>} />
            <Route path="/admin/forecast" element={<RequireRole roles={ADMIN}><ReportsHub /></RequireRole>} />
            <Route path="/admin/no-show" element={<RequireRole roles={ADMIN}><ReportsHub /></RequireRole>} />
            <Route path="/admin/reports" element={<RequireRole roles={ADMIN}><ReportsHub /></RequireRole>} />
            <Route path="/admin/incidents" element={<RequireRole roles={ADMIN}><AdminIncidentsPage /></RequireRole>} />
            <Route path="/admin/maintenance" element={<RequireRole roles={ADMIN}><AdminMaintenancePage /></RequireRole>} />
            <Route path="/admin/rules-policies" element={<RequireRole roles={ADMIN}><RulesPoliciesHub /></RequireRole>} />
            <Route path="/admin/rules" element={<RequireRole roles={ADMIN}><Navigate to="/admin/rules-policies" replace /></RequireRole>} />
            <Route path="/admin/policies" element={<RequireRole roles={ADMIN}><Navigate to="/admin/rules-policies?tab=policies" replace /></RequireRole>} />
            <Route path="/admin/bookings" element={<RequireRole roles={ADMIN}><BookingsAdmin /></RequireRole>} />
            <Route path="/admin/capacity" element={<RequireRole roles={ADMIN}><CapacityAdmin /></RequireRole>} />
            <Route path="/admin/cottages" element={<RequireRole roles={ADMIN}><CottagesAdmin /></RequireRole>} />
            <Route path="/admin/guests" element={<RequireRole roles={ADMIN}><GuestsAdmin /></RequireRole>} />
            <Route path="/admin/team" element={<Navigate to="/root" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </PageTransition>
        </Suspense>
      </TampisawProvider>
    </>
  )
}

// Data router so useBlocker (leave confirmation) works; one splat route hosts the existing <Routes> tree.
const router = createHashRouter([{ path: "*", element: <Shell /> }])

export default function App() {
  return <RouterProvider router={router} />
}
