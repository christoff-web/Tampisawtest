import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Bell, BellRing, Check, CheckCheck } from "lucide-react"
import { useTampisaw } from "../store"
import { prettyDateTime } from "../lib/rules"
import type { Notice } from "../types"

const KEY = (userId: string) => `tampisaw-read-notices:${userId}`
const CAP = 400

const readSet = (userId: string): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY(userId)) ?? "[]") as string[])
  } catch {
    return new Set()
  }
}

/** Which kind of event a notice is about, so important ones (payments, refunds, cancellations...) get a clear label. */
export function noticeKind(n: Notice): { label: string; tone: string } {
  const m = n.message.toLowerCase()
  if (/refund|deposit kept/.test(m)) return { label: "Refund", tone: "bg-success-100 text-success-800" }
  if (/cancel/.test(m)) return { label: "Cancellation", tone: "bg-danger-100 text-danger-800" }
  if (/payment|paid|proof|receipt|balance/.test(m)) return { label: "Payment", tone: "bg-sky-100 text-sky-800" }
  if (/confirm|reserved|booking/.test(m)) return { label: "Booking", tone: "bg-aqua-100 text-aqua-800" }
  if (/account|password/.test(m)) return { label: "Account", tone: "bg-violet-100 text-violet-800" }
  return { label: "Update", tone: "bg-slate-100 text-slate-700" }
}

/**
 * The notices this person should see, with read / unread state. "Read" is remembered per person in this browser,
 * and the list refreshes by itself with the rest of the data, so new notices appear without reloading the page.
 */
export function useNotices() {
  const { state, currentUser } = useTampisaw()
  const userId = currentUser?.id ?? ""
  const [read, setRead] = useState<Set<string>>(() => (userId ? readSet(userId) : new Set()))
  useEffect(() => setRead(userId ? readSet(userId) : new Set()), [userId])

  const notices = useMemo(() => {
    if (!currentUser) return []
    return state.notices
      .filter((n) =>
        currentUser.role === "guest"
          ? n.audience === "guest" && n.guestId === currentUser.guestId
          : currentUser.role === "admin"
            ? n.audience === "staff" || n.audience === "admin"
            : n.audience === "staff",
      )
      .slice(0, 60)
  }, [state.notices, currentUser])

  const persist = useCallback(
    (next: Set<string>) => {
      setRead(next)
      if (!userId) return
      try {
        localStorage.setItem(KEY(userId), JSON.stringify([...next].slice(-CAP)))
      } catch {
        /* storage full or blocked: read marks just last for this visit */
      }
    },
    [userId],
  )

  const unread = notices.filter((n) => !read.has(n.id))
  return {
    notices,
    unread,
    isRead: (id: string) => read.has(id),
    markRead: (id: string) => persist(new Set(read).add(id)),
    markAllRead: () => persist(new Set([...read, ...notices.map((n) => n.id)])),
  }
}

/** Bell with an unread counter. A new notice makes the bell ring once and shows a short toast so it cannot be missed. */
export function NotificationBell() {
  const { notices, unread, isRead, markRead, markAllRead } = useNotices()
  const { currentUser } = useTampisaw()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState<Notice | null>(null)
  const seen = useRef<Set<string> | null>(null)
  const box = useRef<HTMLDivElement>(null)

  // Announce notices that arrive while the page is open (not the ones already there at load).
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(notices.map((n) => n.id))
      return
    }
    const fresh = notices.filter((n) => !seen.current!.has(n.id) && !isRead(n.id))
    for (const n of notices) seen.current.add(n.id)
    if (fresh.length) {
      setToast(fresh[0])
      const id = window.setTimeout(() => setToast(null), 6000)
      return () => window.clearTimeout(id)
    }
  }, [notices]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  if (!currentUser) return null
  const count = unread.length
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={count ? `Notifications, ${count} unread` : "Notifications, none unread"}
        aria-expanded={open}
        className={`relative grid size-11 place-items-center rounded-xl border bg-white hover:bg-slate-50 ${count ? "border-aqua-300 text-aqua-700" : "text-slate-500"}`}
      >
        {count ? <BellRing size={20} /> : <Bell size={20} />}
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-danger-500 px-1 text-[11px] font-extrabold leading-5 text-white ring-2 ring-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-extrabold">Notifications {count > 0 && <span className="text-danger-600">({count} new)</span>}</p>
            <button type="button" onClick={markAllRead} disabled={!count} className="flex items-center gap-1 text-xs font-bold text-aqua-700 disabled:text-slate-300">
              <CheckCheck size={14} /> Mark all read
            </button>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {notices.map((n) => {
              const k = noticeKind(n)
              const unreadItem = !isRead(n.id)
              return (
                <li key={n.id} className={`border-b last:border-0 ${unreadItem ? "bg-aqua-50/70" : ""}`}>
                  <button type="button" onClick={() => markRead(n.id)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${unreadItem ? "bg-aqua-600" : "bg-transparent"}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${k.tone}`}>{k.label}</span>
                        <span className="sr-only">{unreadItem ? "Unread" : "Read"}</span>
                        {!unreadItem && <Check size={12} className="text-slate-300" aria-hidden />}
                      </span>
                      <span className={`block text-sm leading-5 ${unreadItem ? "font-semibold text-ink-900" : "text-slate-600"}`}>{n.message}</span>
                      <span className="mt-1 block text-xs text-slate-400">{prettyDateTime(n.at)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
            {notices.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">You are all caught up. Nothing new.</li>}
          </ul>
          {currentUser.role === "guest" && (
            <Link to="/my-bookings" onClick={() => setOpen(false)} className="block border-t px-4 py-3 text-center text-sm font-bold text-aqua-700 hover:bg-slate-50">
              Open My Bookings
            </Link>
          )}
        </div>
      )}

      {toast && (
        <div role="status" aria-live="polite" className="fixed right-4 top-20 z-[60] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-aqua-200 bg-white p-4 shadow-xl">
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-aqua-700">
            <BellRing size={14} /> New notification
          </p>
          <p className="mt-1 text-sm leading-5 text-ink-900">{toast.message}</p>
          <div className="mt-2 flex justify-end gap-3 text-xs font-bold">
            <button type="button" className="text-slate-500" onClick={() => setToast(null)}>Dismiss</button>
            <button type="button" className="text-aqua-700" onClick={() => { markRead(toast.id); setToast(null); setOpen(true) }}>View</button>
          </div>
        </div>
      )}
    </div>
  )
}
