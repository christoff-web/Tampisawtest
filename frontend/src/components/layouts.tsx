import { useConfirm } from "./confirm"
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  ConciergeBell,
  Footprints,
  LayoutDashboard,
  LogOut,
  Menu,
  Palmtree,
  QrCode,
  Users,
  X,
  ClipboardCheck,
  ClipboardList,
  ChartNoAxesCombined,
  ChevronsLeft,
  ChevronsRight,
    CloudRain,
  Droplets,
  LifeBuoy,
  Package,
  Tags,
  ShieldCheck,
  SlidersHorizontal,
  Watch,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom"
import { Button } from "./ui"
import { useTampisaw } from "../store"
import { canAccess, isAdminRole, roleLabel } from "../lib/ops"
import { NotificationBell } from "./notifications"
import { useI18n, type TKey } from "../lib/i18n"

function useStored(key: string, initial: boolean) {
  const [v, setV] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : raw === "1"
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, v ? "1" : "0")
    } catch {
      /* storage unavailable */
    }
  }, [key, v])
  return [v, setV] as const
}

export function Logo({ light = false, iconOnly = false }: { light?: boolean; iconOnly?: boolean }) {
  const { t } = useI18n()
  return (
    <Link
      to="/"
      className={`flex items-center gap-2 text-xl font-extrabold tracking-tight ${
        light ? "text-white" : "text-ink-950"
      }`}
    >
      <img loading="lazy" decoding="async"
        src="/golden-pyramid/logo.jpg"
        alt={t("nav.logoAlt")}
        className="size-10 shrink-0 rounded-xl bg-white object-contain sm:size-11"
      />
      {!iconOnly && "Tampisaw"}
    </Link>
  )
}

export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { currentUser, logout } = useTampisaw()
  const { t } = useI18n()
  const home =
    isAdminRole(currentUser?.role)
      ? "/admin"
      : currentUser?.role === "receptionist"
        ? "/staff"
        : "/my-bookings"
  const links = [
    { to: "/#cottages", label: t("nav.cottages") },
    ...(currentUser?.role === "guest"
      ? [
          { to: "/my-bookings", label: t("nav.myBookings") },
          { to: "/help", label: t("nav.help") },
          { to: "/privacy", label: t("nav.privacy") },
        ]
      : []),
  ]
  const { ask, dialog } = useConfirm()
  const { pathname } = useLocation()
  const signOut = () =>
    ask({
      title: t("signout.title"),
      body: t("signout.body"),
      confirmLabel: t("common.signOut"),
      danger: true,
      run: () => {
        logout()
        navigate("/")
      },
    })
  if (currentUser?.role === "guest" && pathname !== "/") {
    return (
      <WorkspaceShell title={t("nav.guest")} role="guest" groups={guestGroups(t)} protect={false}>
        {children}
      </WorkspaceShell>
    )
  }
  return (
    <div className="min-h-screen bg-sand-50">
      {dialog}
      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl sm:h-18 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo />
          <nav className="hidden items-center gap-7 md:flex">
            {links.map((l) => (
              <Link key={l.to} className="text-sm font-bold text-slate-600 hover:text-aqua-700" to={l.to}>
                {l.label}
              </Link>
            ))}
            {currentUser ? (
              <>
                {currentUser.role !== "guest" && (
                  <Link className="text-sm font-bold text-aqua-700" to={home}>
                    {isAdminRole(currentUser.role) ? "Admin workspace" : "Receptionist workspace"}
                  </Link>
                )}
                <span className="text-xs font-bold text-slate-500">{currentUser.name}</span>
                <button onClick={signOut} className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-100">
                  <LogOut size={15} /> {t("common.logOut")}
                </button>
              </>
            ) : (
              <Link className="text-sm font-bold text-slate-600 hover:text-aqua-700" to="/login">
                {t("common.logIn")}
              </Link>
            )}
            {currentUser?.role === "guest" && <Button onClick={() => navigate("/book")}>{t("common.bookNow")}</Button>}
          </nav>
          <button
            className="grid size-11 place-items-center rounded-xl md:hidden"
            onClick={() => setOpen(!open)}
            aria-label={t("nav.toggleMenu")}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
        {open && (
          <div className="grid gap-2 border-t bg-white p-4 md:hidden" onClick={() => setOpen(false)}>
            {currentUser?.role === "guest" && <Link className="rounded-xl p-3 font-bold" to="/book">{t("common.bookNow")}</Link>}
            {links.map((l) => (
              <Link key={l.to} className="rounded-xl p-3 font-bold" to={l.to}>{l.label}</Link>
            ))}
            {currentUser ? (
              <>
                {currentUser.role !== "guest" && (
                  <Link className="rounded-xl bg-slate-100 p-3 font-bold" to={home}>Open workspace</Link>
                )}
                <button className="rounded-xl p-3 text-left font-bold" onClick={signOut}>{t("common.logOut")} ({currentUser.name})</button>
              </>
            ) : (
              <Link className="rounded-xl p-3 font-bold" to="/login">{t("common.logIn")}</Link>
            )}
          </div>
        )}
      </header>
      {children}
    </div>
  )
}

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  badge?: number
  /** Extra paths that keep this item highlighted. */
  also?: string[]
}

type NavGroup = { label: string; items: NavItem[] }

const roleTone: Record<string, { bg: string; chip: string; active: string }> = {
  guest: { bg: "bg-aqua-600", chip: "bg-white text-aqua-700", active: "bg-white text-aqua-700" },
  receptionist: { bg: "bg-aqua-800", chip: "bg-aqua-200 text-aqua-900", active: "bg-aqua-200 text-aqua-900" },
  admin: { bg: "bg-ink-950", chip: "bg-aqua-500 text-white", active: "bg-aqua-500 text-white" },
}

function WorkspaceShell({
  title,
  groups,
  role,
  children,
  footerExtra,
  protect = true,
}: {
  title: string
  groups: NavGroup[]
  role: string
  children: ReactNode
  footerExtra?: ReactNode
  protect?: boolean
}) {
  const tone = roleTone[role] ?? roleTone.admin
  const { t } = useI18n()
  // Guest chrome is translated; staff/admin chrome stays English.
  const L = (key: TKey, en: string) => (role === "guest" ? t(key) : en)
  const [open, setOpen] = useState(false)
  const [rail, setRail] = useStored("tampisaw.rail", false)
  useEffect(() => {
    document.documentElement.classList.add("comfy")
  }, [])
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { currentUser, logout } = useTampisaw()
  const initials = (currentUser?.name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
  const { ask, dialog } = useConfirm()
  const signOut = () =>
    ask({
      title: L("signout.title", "Sign out?"),
      body: L("signout.body", "You will need to log in again to continue."),
      confirmLabel: L("common.signOut", "Sign out"),
      danger: true,
      run: () => {
        logout()
        navigate("/login")
      },
    })
  return (
    <div className={`workspace-protected workspace-staff min-h-dvh bg-slate-50 lg:grid ${rail ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[256px_1fr]"}`} onCopy={protect ? (e) => e.preventDefault() : undefined} onContextMenu={protect ? (e) => e.preventDefault() : undefined}>
      {dialog}
      {open && <div className="fixed inset-0 z-40 bg-ink-950/50 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[290px] max-w-[85vw] flex-col overflow-y-auto ${tone.bg} p-4 text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-auto ${rail ? "lg:items-center lg:px-2" : "lg:p-4"} ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
          <span className="lg:hidden"><Logo light /></span>
          <span className="hidden lg:block"><Logo light iconOnly={rail} /></span>
          <button className="grid size-10 place-items-center rounded-xl hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label={L("nav.closeMenu", "Close menu")}>
            <X />
          </button>
        </div>
        <p className={`mb-6 inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider ${tone.chip} ${rail ? "lg:hidden" : ""}`}>{title}</p>
        <nav className="grid w-full gap-6">
          {groups.map((g) => (
            <div key={g.label} className="grid gap-1.5">
              <p className={`px-3 text-xs font-extrabold uppercase tracking-[0.18em] text-white/60 ${rail ? "lg:hidden" : ""}`}>{g.label}</p>
              {g.items.map(({ to, label, icon: Icon, end, badge, also }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setOpen(false)}
                  title={label}
                  className={({ isActive }) =>
                    `relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition lg:min-h-0 ${rail ? "lg:justify-center lg:px-0 lg:py-3" : ""} ${
                      isActive || also?.includes(pathname) ? tone.active : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`
                  }
                >
                  <Icon size={18} className="shrink-0" />
                  <span className={`flex-1 ${rail ? "lg:hidden" : ""}`}>{label}</span>
                  {!!badge && (
                    <span key={badge} className={`animate-badge-pulse grid min-w-5 place-items-center rounded-full bg-danger-600 px-1.5 text-xs font-extrabold text-white ${rail ? "lg:absolute lg:right-1 lg:top-1 lg:min-w-4 lg:px-1 lg:text-xs" : ""}`}>
                      {badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className={`mt-auto w-full pt-5 ${rail ? "lg:hidden" : ""}`}>
          {footerExtra}
          <button onClick={signOut} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-white/25 px-4 text-sm font-bold text-white hover:bg-white/10">
            <LogOut size={16} /> {L("common.signOut", "Sign out")}
          </button>
        </div>
        <button
          onClick={signOut}
          title={L("common.signOut", "Sign out")}
          aria-label={L("common.signOut", "Sign out")}
          className={`mt-auto hidden size-11 place-items-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white ${rail ? "lg:grid" : ""}`}
        >
          <LogOut size={18} />
        </button>
      </aside>
      <div className="min-w-0 overflow-x-clip">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b bg-white/90 px-3 backdrop-blur sm:px-6 lg:h-14">
          <button onClick={() => setOpen(true)} className="grid size-11 shrink-0 place-items-center rounded-xl border lg:hidden" aria-label={L("nav.openMenu", "Open menu")}>
            <Menu />
          </button>
          <button
            onClick={() => setRail(!rail)}
            className="hidden size-9 shrink-0 place-items-center rounded-lg border text-slate-600 hover:bg-slate-100 lg:grid"
            aria-label={rail ? L("nav.expandSidebar", "Expand sidebar") : L("nav.minimizeSidebar", "Minimize sidebar")}
            title={rail ? L("nav.expandSidebar", "Expand sidebar") : L("nav.minimizeSidebar", "Minimize sidebar")}
          >
            {rail ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="text-sm font-bold text-ink-900">{L("nav.venueName", "Golden Pyramid Swimming Pool")}</p>
            <p className="text-xs text-slate-500">
              <a href="https://maps.app.goo.gl/RbM3UtowLGxQVgUN6" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-aqua-700 hover:underline">
                {L("nav.venueCity", "Quezon City")}
              </a>{" "}
              · {L("nav.venueHours", "open Wed-Mon, closed Tuesdays")}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <NotificationBell />
            <span className="hidden text-right sm:block">
              <span className="block text-sm font-bold">{currentUser?.name}</span>
              <span className="block text-xs capitalize text-slate-500">{currentUser?.role === "guest" ? L("role.guest", "guest") : currentUser ? roleLabel[currentUser.role] : ""}</span>
            </span>
            <span className="grid size-10 place-items-center rounded-full bg-aqua-100 font-extrabold text-aqua-800">{initials}</span>
          </div>
        </header>
        <main className="p-5 sm:p-10 lg:p-14">{children}</main>
      </div>
    </div>
  )
}

function useOpenCounts() {
  const { state } = useTampisaw()
  return {
    incidents: state.incidents.filter((i) => i.status === "requested" || i.status === "in-progress").length,
    maintenance: state.maintenance.filter((m) => m.status === "requested" || m.status === "on-the-way").length,
    cancellations: state.bookings.filter((b) => b.status === "cancellation-requested").length,
    proofs: state.bookings.filter((b) => b.paymentStatus === "submitted").length,
  }
}

const InsideAdminLayout = createContext(false)

export function AdminLayout({ children }: { children: ReactNode }) {
  const c = useOpenCounts()

  const nested = useContext(InsideAdminLayout)
  const groups: NavGroup[] = [
    {
      label: "Overview",
      items: [
        { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
        { to: "/admin/reports", label: "Reports & forecasts", icon: ChartNoAxesCombined, also: ["/admin/forecast", "/admin/no-show"] },
        { to: "/admin/shifts", label: "Shift reports", icon: ClipboardCheck },
      ],
    },
    {
      label: "Reservations",
      items: [
        { to: "/admin/bookings", label: "Bookings", icon: ClipboardList, badge: c.proofs },
        { to: "/admin/capacity", label: "Slots & capacity", icon: CalendarDays },
        { to: "/admin/cottages", label: "Cottages & rooms", icon: Palmtree },
        { to: "/admin/guests", label: "Guest records", icon: Users },
      ],
    },
    {
      label: "Safety & upkeep",
      items: [
        { to: "/admin/incidents", label: "Incidents", icon: AlertTriangle, badge: c.incidents },
        { to: "/admin/maintenance", label: "Maintenance", icon: Wrench, badge: c.maintenance },
        { to: "/admin/weather", label: "Weather protocol", icon: CloudRain },
        { to: "/admin/pool-log", label: "Pool water log", icon: Droplets },
      ],
    },
    {
      label: "Configuration",
      items: [
        { to: "/admin/rules-policies", label: "Rules & policies", icon: SlidersHorizontal },
        { to: "/admin/tariffs", label: "Tariffs & overtime", icon: Tags },
      ],
    },
    {
      label: "Staff tools",
      items: [{ to: "/staff", label: "Front desk view (staff tools)", icon: ConciergeBell }],
    },
  ]
  if (nested) return <>{children}</>
  return (
    <InsideAdminLayout.Provider value={true}>
      <WorkspaceShell title="Admin" role="admin" groups={groups}>
        {children}
      </WorkspaceShell>
    </InsideAdminLayout.Provider>
  )
}

export function StaffLayout({ children }: { children: ReactNode }) {
  const c = useOpenCounts()
  const { currentUser } = useTampisaw()
  const allGroups: NavGroup[] = [
    {
      label: "Overview",
      items: [{ to: "/staff", label: "Dashboard", icon: LayoutDashboard, end: true }],
    },
    {
      label: "Guests",
      items: [
        { to: "/staff/appointments", label: "Appointments", icon: ClipboardList, badge: c.cancellations },
        { to: "/staff/cottages", label: "Cottage reservations", icon: Palmtree },
        { to: "/staff/qr", label: "QR verification", icon: QrCode },
        { to: "/staff/walk-in", label: "Walk-in entry", icon: Footprints },
      ],
    },
    {
      label: "Money",
      items: [
        { to: "/staff/payments", label: "Payments & refunds", icon: Banknote, badge: c.proofs },
        { to: "/staff/addons", label: "Add-ons & deposits", icon: Package },
        { to: "/staff/shift", label: "End of shift", icon: ClipboardCheck },
      ],
    },
    {
      label: "Pool care",
      items: [
        { to: "/staff/bracelets", label: "Bracelets & time out", icon: Watch },
        { to: "/staff/incidents", label: "Incidents", icon: AlertTriangle, badge: c.incidents },
        { to: "/staff/maintenance", label: "Maintenance", icon: Wrench, badge: c.maintenance },
      ],
    },
  ]
  const groups = allGroups
    .map((g) => ({ ...g, items: g.items.filter((l) => !currentUser || canAccess(currentUser.role, l.to)) }))
    .filter((g) => g.items.length)
  return (
    <WorkspaceShell
      title={isAdminRole(currentUser?.role) ? "Admin · Desk" : currentUser ? roleLabel[currentUser.role] : "Reception desk"}
      role={isAdminRole(currentUser?.role) ? "admin" : "receptionist"}
      groups={groups}
      footerExtra={
        isAdminRole(currentUser?.role) ? (
          <Link to="/admin" className="mb-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-bold text-white hover:bg-white/15">
            <ShieldCheck size={16} /> Back to Admin
          </Link>
        ) : undefined
      }
    >
      {children}
    </WorkspaceShell>
  )
}

const guestGroups = (t: (key: TKey) => string): NavGroup[] => [
  { label: t("nav.groupReserve"), items: [{ to: "/book", label: t("common.bookNow"), icon: CalendarDays }] },
  { label: t("nav.groupStay"), items: [{ to: "/my-bookings", label: t("nav.myBookings"), icon: ClipboardList }] },
  { label: t("nav.groupSupport"), items: [{ to: "/help", label: t("nav.help"), icon: LifeBuoy }, { to: "/privacy", label: t("nav.privacy"), icon: ShieldCheck }] },
]

export function StaffHeader() {
  return null
}
