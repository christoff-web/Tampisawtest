import { Link, useLocation, useSearchParams } from "react-router-dom"
import { AdminLayout } from "./layouts"
import { BookingRulesPage, ForecastPage, NoShowRiskPage, ReportsFlowPage } from "../pages/admin-flow"
import { PoliciesAdmin } from "../pages/admin"

const tabClass = (on: boolean) =>
  `min-h-11 rounded-xl px-4 py-2.5 text-sm font-bold transition ${on ? "bg-ink-950 text-white" : "border bg-white text-slate-600 hover:bg-slate-100"}`

export function RulesPoliciesHub() {
  const [params, setParams] = useSearchParams()
  const tab = params.get("tab") === "policies" ? "policies" : "rules"
  const set = (t: string) => setParams(t === "rules" ? {} : { tab: t }, { replace: true })
  return (
    <AdminLayout>
      <div role="tablist" aria-label="Rules and policies" className="mb-6 flex flex-wrap gap-2">
        <button role="tab" id="tab-rules" aria-selected={tab === "rules"} aria-controls="panel-rules" className={tabClass(tab === "rules")} onClick={() => set("rules")}>
          Booking rules
        </button>
        <button role="tab" id="tab-policies" aria-selected={tab === "policies"} aria-controls="panel-policies" className={tabClass(tab === "policies")} onClick={() => set("policies")}>
          Policies
        </button>
      </div>
      {/* Both stay mounted so unsaved edits and leave guards survive a tab switch. */}
      <div role="tabpanel" id="panel-rules" aria-labelledby="tab-rules" hidden={tab !== "rules"}>
        <BookingRulesPage />
      </div>
      <div role="tabpanel" id="panel-policies" aria-labelledby="tab-policies" hidden={tab !== "policies"}>
        <PoliciesAdmin />
      </div>
    </AdminLayout>
  )
}

const REPORT_TABS = [
  { to: "/admin/reports", label: "Reports" },
  { to: "/admin/forecast", label: "Forecast" },
  { to: "/admin/no-show", label: "No-show risk" },
]

export function ReportsHub() {
  const { pathname } = useLocation()
  return (
    <AdminLayout>
      <nav aria-label="Reports and forecasts" className="mb-6 flex flex-wrap gap-2">
        {REPORT_TABS.map((t) => (
          <Link key={t.to} to={t.to} aria-current={pathname === t.to ? "page" : undefined} className={tabClass(pathname === t.to)}>
            {t.label}
          </Link>
        ))}
      </nav>
      {pathname === "/admin/forecast" ? <ForecastPage /> : pathname === "/admin/no-show" ? <NoShowRiskPage /> : <ReportsFlowPage />}
    </AdminLayout>
  )
}
