import { useMemo, useState, type FormEvent } from "react"
import { LogOut, ShieldCheck } from "lucide-react"
import { Badge, Button, Card, Input, Modal, Select } from "../components/ui"
import { PasswordField, PhoneField } from "../components/auth-bits"
import { useConfirm } from "../components/confirm"
import { useTampisaw } from "../store"
import { isValidEmail, isValidName, lettersOnly, passwordProblems, phoneProblem, roleLabel } from "../lib/ops"
import type { User } from "../types"

const PAGE = 15
type StaffRole = "receptionist" | "admin"
const blank = { name: "", email: "", phone: "", role: "receptionist" as StaffRole, password: "" }

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—")

/**
 * The Root Admin console. It has exactly two modules, Staff Accounts and Audit Logs, and none of the resort's
 * operational screens (bookings, guests, payments...). Only the root admin can open it.
 */
export function RootConsole() {
  const [tab, setTab] = useState<"staff" | "audit">("staff")
  const { currentUser, logout } = useTampisaw()
  const { ask, dialog } = useConfirm()
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-aqua-600 text-white"><ShieldCheck size={20} /></span>
            <div>
              <p className="text-sm font-extrabold">Tampisaw · Root administrator</p>
              <p className="text-xs text-slate-500">{currentUser?.name} · {currentUser?.email}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              ask({ title: "Sign out?", body: "You will need to log in again to manage accounts.", confirmLabel: "Sign out", danger: true, run: () => logout() })
            }
          >
            <LogOut size={16} /> Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div role="tablist" aria-label="Root console modules" className="mb-5 flex flex-wrap gap-2">
          {([["staff", "Staff Accounts"], ["audit", "Audit Logs"]] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-xl px-5 py-2.5 text-sm font-bold ${tab === id ? "bg-aqua-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "staff" ? <StaffAccounts /> : <AuditLog />}
      </main>
      {dialog}
    </div>
  )
}

function StaffAccounts() {
  const { state, dispatch } = useTampisaw()
  const { ask, dialog } = useConfirm()
  const [editing, setEditing] = useState<User | "new" | null>(null)
  const [pwFor, setPwFor] = useState<User | null>(null)
  const [filter, setFilter] = useState<"all" | "active" | "archived">("all")
  const [notice, setNotice] = useState("")
  const staff = state.users.filter((u) => u.role !== "guest")
  const shown = staff.filter((u) => (filter === "all" ? true : filter === "archived" ? u.archived : !u.archived))
  const actionButtonClass = "min-h-9 w-full min-w-0 justify-center px-2.5 text-[11px] font-bold sm:text-xs"

  const run = async (action: Parameters<typeof dispatch>[0], ok: string) => {
    const res = await dispatch(action, { silent: true })
    setNotice(res.ok ? ok : (res.error ?? "That could not be done."))
    return res
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b p-5">
          <div>
            <h2 className="text-lg font-extrabold">Accounts</h2>
            <p className="text-xs text-slate-500">Archived accounts keep their history but cannot sign in.</p>
          </div>
          <div className="flex items-end gap-3">
            <Select label="Show" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
            <Button onClick={() => { setNotice(""); setEditing("new") }}>Add staff account</Button>
          </div>
        </div>
        {notice && <p role="status" className="border-b bg-aqua-50 px-5 py-3 text-sm font-semibold text-aqua-900">{notice}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                {["Full name", "E-mail", "Contact", "Role", "Status", "Created", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((u) => {
                const root = u.role === "root-admin"
                return (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-bold">{u.name}</td>
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3">{u.phone || "—"}</td>
                    <td className="px-4 py-3"><Badge tone={root ? "info" : "neutral"}>{roleLabel[u.role]}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={u.archived ? "warning" : "success"}>{u.archived ? "Archived" : "Active"}</Badge></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmt(u.createdAt)}{u.createdBy ? <><br />by {u.createdBy}</> : null}</td>
                     <td className="px-4 py-3 align-top">
                      {root ? (
                        <div className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                          Protected
                        </div>
                      ) : (
                        <div className="grid min-w-[220px] max-w-[300px] grid-cols-2 gap-2">
                          <Button variant="secondary" className={actionButtonClass} onClick={() => { setNotice(""); setEditing(u) }}>Edit</Button>
                          <Button variant="secondary" className={actionButtonClass} onClick={() => { setNotice(""); setPwFor(u) }}>Reset password</Button>
                          {u.archived ? (
                            <Button variant="secondary" className={actionButtonClass} onClick={() => run({ type: "RESTORE_USER", id: u.id }, `${u.name} was restored.`)}>Restore</Button>
                          ) : (
                            <Button
                              variant="secondary"
                              className={actionButtonClass}
                              onClick={() =>
                                ask({
                                  title: `Archive ${u.name}?`,
                                  body: "They will no longer be able to sign in. Their history stays and you can restore the account later.",
                                  confirmLabel: "Archive",
                                  run: () => void run({ type: "ARCHIVE_USER", id: u.id }, `${u.name} was archived.`),
                                })
                              }
                            >
                              Archive
                            </Button>
                          )}
                          <Button
                            variant="danger"
                            className={actionButtonClass}
                            onClick={() =>
                              ask({
                                title: `Delete ${u.name}?`,
                                body: "This permanently removes the login. The name stays on past audit entries. Archive instead if you may need the account again.",
                                confirmLabel: "Delete account",
                                danger: true,
                                run: () => void run({ type: "DELETE_STAFF_USER", id: u.id }, `${u.name} was deleted.`),
                              })
                            }
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {shown.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No accounts match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <StaffForm
        key={editing === "new" ? "new" : (editing?.id ?? "none")}
        target={editing}
        onClose={() => setEditing(null)}
        onSave={async (f) => {
          const res = editing === "new"
            ? await dispatch({ type: "CREATE_STAFF_USER", ...f }, { silent: true })
            : await dispatch({ type: "UPDATE_STAFF_USER", id: (editing as User).id, name: f.name, email: f.email, phone: f.phone, role: f.role }, { silent: true })
          if (res.ok) setNotice(editing === "new" ? `${f.name} can now sign in.` : "Account updated.")
          return res.ok ? null : (res.error ?? "That could not be saved.")
        }}
      />
      <PasswordModal
        target={pwFor}
        onClose={() => setPwFor(null)}
        onSave={async (pw) => {
          const res = await dispatch({ type: "SET_USER_PASSWORD", id: pwFor!.id, password: pw }, { silent: true })
          if (res.ok) setNotice(`New password set for ${pwFor!.name}.`)
          return res.ok ? null : (res.error ?? "That could not be saved.")
        }}
      />
      {dialog}
    </>
  )
}

function StaffForm({ target, onClose, onSave }: { target: User | "new" | null; onClose: () => void; onSave: (f: typeof blank) => Promise<string | null> }) {
  const isNew = target === "new"
  const [f, setF] = useState(() => (target && target !== "new" ? { name: target.name, email: target.email, phone: target.phone, role: target.role as StaffRole, password: "" } : blank))
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    if (!isValidName(f.name)) return setError("Enter the full name using letters only.")
    if (!isValidEmail(f.email)) return setError("Enter a valid e-mail address.")
    if (phoneProblem(f.phone) || !f.phone.trim()) return setError(phoneProblem(f.phone) || "Enter the contact number.")
    if (isNew && passwordProblems(f.password).length) return setError(`The password still needs: ${passwordProblems(f.password).join("; ").toLowerCase()}.`)
    setBusy(true)
    const err = await onSave(f)
    setBusy(false)
    if (err) setError(err)
    else onClose()
  }
  return (
    <Modal open={!!target} title={isNew ? "Add staff account" : "Edit staff account"} onClose={onClose}>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <Input label="Full name" value={f.name} autoComplete="off" onChange={(e) => setF({ ...f, name: lettersOnly(e.target.value) })} />
        <Input label="E-mail address" type="email" value={f.email} autoComplete="off" onChange={(e) => setF({ ...f, email: e.target.value })} />
        <PhoneField label="Contact number" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
        <Select label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as StaffRole })}>
          <option value="receptionist">Receptionist (front desk)</option>
          <option value="admin">Admin</option>
        </Select>
        {isNew && <PasswordField label="Temporary password" name="new-password" autoComplete="new-password" rules value={f.password} onChange={(v) => setF({ ...f, password: v })} />}
        {error && <p role="alert" className="rounded-xl bg-danger-50 p-3 text-sm font-semibold text-danger-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save account"}</Button>
        </div>
      </form>
    </Modal>
  )
}

function PasswordModal({ target, onClose, onSave }: { target: User | null; onClose: () => void; onSave: (pw: string) => Promise<string | null> }) {
  const [pw, setPw] = useState("")
  const [error, setError] = useState("")
  return (
    <Modal open={!!target} title={`Reset password for ${target?.name ?? ""}`} onClose={() => { setPw(""); setError(""); onClose() }}>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault()
          if (passwordProblems(pw).length) return setError(`The password still needs: ${passwordProblems(pw).join("; ").toLowerCase()}.`)
          const err = await onSave(pw)
          if (err) setError(err)
          else { setPw(""); setError(""); onClose() }
        }}
      >
        <PasswordField label="New password" name="new-password" autoComplete="new-password" rules value={pw} onChange={setPw} />
        <p className="text-xs text-slate-500">Give the new password to the person in private. They are signed out of their current session.</p>
        {error && <p role="alert" className="rounded-xl bg-danger-50 p-3 text-sm font-semibold text-danger-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Set password</Button>
        </div>
      </form>
    </Modal>
  )
}

function AuditLog() {
  const { state } = useTampisaw()
  const [who, setWho] = useState("")
  const [role, setRole] = useState("all")
  const [kind, setKind] = useState<"all" | "accounts" | "bookings">("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(0)
  const isAccount = (a: string) => /account|password|Root admin/i.test(a)
  const rows = useMemo(
    () =>
      state.auditLog.filter((e) => {
        if (who && !`${e.actor} ${e.action}`.toLowerCase().includes(who.toLowerCase())) return false
        if (role !== "all" && (e.role ?? "unknown") !== role) return false
        if (kind === "accounts" && !isAccount(e.action)) return false
        if (kind === "bookings" && !e.bookingId) return false
        const day = e.at.slice(0, 10)
        if (from && day < from) return false
        if (to && day > to) return false
        return true
      }),
    [state.auditLog, who, role, kind, from, to],
  )
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const slice = rows.slice(cur * PAGE, cur * PAGE + PAGE)
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0) }
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-3 border-b p-5 sm:grid-cols-2 lg:grid-cols-5">
        <Input label="Person or action" value={who} onChange={(e) => reset(setWho)(e.target.value)} />
        <Select label="Role" value={role} onChange={(e) => reset(setRole)(e.target.value)}>
          <option value="all">All roles</option>
          {["guest", "receptionist", "admin", "root-admin", "system"].map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
        <Select label="Type" value={kind} onChange={(e) => reset(setKind)(e.target.value as typeof kind)}>
          <option value="all">Everything</option>
          <option value="accounts">Account changes</option>
          <option value="bookings">Booking changes</option>
        </Select>
        <Input label="From" type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>{["Date & time", "Done by", "Role", "Action", "Booking"].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {slice.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{fmt(e.at)}</td>
                <td className="px-4 py-3 font-bold">{e.actor}</td>
                <td className="px-4 py-3 capitalize">{e.role ?? "—"}</td>
                <td className="px-4 py-3">{e.action}</td>
                <td className="px-4 py-3 text-xs">{e.bookingId ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">{state.auditLog.length === 0 ? "No activity has been recorded yet." : "No entries match these filters."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t p-4 text-sm">
        <span className="text-slate-500">{rows.length} entr{rows.length === 1 ? "y" : "ies"}</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" className="min-h-9 px-3 text-xs" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</Button>
          <span className="text-xs font-semibold">Page {cur + 1} of {pages}</span>
          <Button variant="secondary" className="min-h-9 px-3 text-xs" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</Button>
        </div>
      </div>
    </Card>
  )
}
