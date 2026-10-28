import { CalendarPlus, Download, MapPin, Printer, QrCode, Trash2 } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { QRCodeCanvas } from "qrcode.react"
import { PublicLayout } from "../components/layouts"
import { Badge, Button, Card, Input, PageTitle } from "../components/ui"
import { ConfirmDialog } from "../components/confirm"
import { useTampisaw } from "../store"
import type { Booking } from "../types"
import { buildIcs, directionsUrl, downloadBlob } from "../lib/guest-tools"
import { prettyDate } from "../lib/rules"
import { useI18n, type TKey } from "../lib/i18n"

const collected: { id: string }[] = [{ id: "birth" }, { id: "contact" }, { id: "pay" }, { id: "health" }]

export function PrivacyPage() {
  const { state, currentUser, deleteMyAccount } = useTampisaw()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [typed, setTyped] = useState("")
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<{ tone: "ok" | "error", text: string } | null>(null)
  const gid = currentUser?.guestId

  const download = () => {
    if (!currentUser) return
    const user = currentUser
    const bookings = state.bookings.filter((b) => !!gid && b.guestId === gid)
    const ids = new Set(bookings.map((b) => b.id))
    const data = {
      exportedAt: new Date().toISOString(),
      note: "This file contains only your own data. Your password and other guests' data are never included.",
      user,
      guestRecord: state.guests.find((g) => g.id === gid) ?? null,
      bookings,
      waivers: bookings.filter((b) => b.waiver).map((b) => ({ bookingId: b.id, waiver: b.waiver })),
      notifications: state.notices.filter((n) => n.audience === "guest" && n.guestId === gid),
      waitlist: state.waitlist.filter((w) => w.guestId === gid),
      refunds: state.refunds.filter((r) => ids.has(r.bookingId)),
      incidents: state.incidents.filter((i) => i.guestId === gid),
      maintenanceRequests: state.maintenance.filter((m) => m.guestId === gid),
    }
    downloadBlob("my-tampisaw-data.json", new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    setMsg({ tone: "ok", text: t("privacy.downloaded") })
  }

  const startDelete = () => {
    setMsg(null)
    setTyped("")
    setOpen(true)
  }

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <PageTitle eyebrow={t("privacy.eyebrow")} title={t("privacy.title")} description={t("privacy.desc")} />
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-extrabold">{t("privacy.collect.h")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("privacy.collect.sub")}</p>
          <div className="mt-4 grid gap-3">
            {collected.map((c) => (
              <div key={c.id} className="rounded-xl border p-4 text-sm leading-6">
                <p className="font-extrabold">{t(`privacy.c.${c.id}.what` as TKey)}</p>
                <p className="text-slate-600">{t("privacy.why", { text: t(`privacy.c.${c.id}.why` as TKey) })}</p>
                <p className="text-slate-600">{t("privacy.kept", { text: t(`privacy.c.${c.id}.keep` as TKey) })}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-600">{t("privacy.rights")} {t("privacy.sim")}</p>
        </Card>
        <Card className="mt-5 p-5 sm:p-6">
          <h2 className="text-lg font-extrabold">{t("privacy.download.h")}</h2>
          <p className="mt-1 text-sm text-slate-600">{t("privacy.download.desc")}</p>
          <Button className="mt-4" variant="secondary" onClick={download}>
            <Download size={17} /> {t("privacy.download.h")}
          </Button>
        </Card>
        <Card className="mt-5 border-danger-200 p-5 sm:p-6">
          <h2 className="text-lg font-extrabold text-danger-700">{t("privacy.delete.h")}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {t("privacy.delete.desc")}
          </p>
          <Button
            className="mt-4"
            variant="danger"
            onClick={startDelete}
          >
            <Trash2 size={17} /> {t("privacy.delete.h")}
          </Button>
        </Card>
        {msg && (
          <p role="status" className={`mt-4 rounded-xl p-3 text-sm font-semibold ${msg.tone === "ok" ? "bg-success-50 text-success-800" : "bg-danger-50 text-danger-800"}`}>
            {msg.text}
          </p>
        )}
        <Link to="/my-bookings" className="mt-6 inline-block text-sm font-bold text-aqua-700">{t("privacy.back")}</Link>
      </main>
      <ConfirmDialog
        open={open}
        title={t("privacy.confirm.title")}
        danger
        closeOnConfirm
        confirmLabel={t("privacy.confirm.label")}
        cancelLabel={t("privacy.confirm.cancel")}
        disabled={typed !== "DELETE"}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          const res = await deleteMyAccount()
          if (!res.ok) setMsg({ tone: "error", text: res.error })
          else navigate("/")
        }}
      >
        <div className="grid gap-3">
          <p>{t("privacy.confirm.body")}</p>
          <Input label={t("privacy.confirm.type")} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
      </ConfirmDialog>
    </PublicLayout>
  )
}

/** Calendar, directions, save-QR and print actions for a ticket. */
export function TicketTools({ booking, spaceName }: { booking: Booking, spaceName?: string }) {
  const { t } = useI18n()
  const canvasId = `qr-png-${booking.id}`
  const savePng = () => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null
    canvas?.toBlob((blob) => blob && downloadBlob(`tampisaw-${booking.id}.png`, blob), "image/png")
  }
  return (
    <div className="no-print mt-5 rounded-xl bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-extrabold">{t("ticket.tools")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" onClick={() => downloadBlob(`tampisaw-${booking.id}.ics`, new Blob([buildIcs(booking, spaceName)], { type: "text/calendar" }))}>
          <CalendarPlus size={17} /> {t("ticket.calendar")}
        </Button>
        <a href={directionsUrl} target="_blank" rel="noreferrer" className="block">
          <Button variant="secondary" className="w-full">
            <MapPin size={17} /> {t("ticket.directions")}
          </Button>
        </a>
        <Button variant="secondary" disabled={!booking.qrToken} onClick={savePng}>
          <QrCode size={17} /> {t("ticket.saveQr")}
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={17} /> {t("ticket.print")}
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{t("ticket.calNote")}</p>
      {booking.qrToken && (
        <div className="hidden" aria-hidden>
          <QRCodeCanvas id={canvasId} value={booking.qrToken} size={512} level="M" marginSize={2} />
        </div>
      )}
    </div>
  )
}

/** "Join waitlist" control for a full session or unit. */
export function WaitlistJoin({ date, slotId, cottageId, guests, what }: { date: string, slotId: string, cottageId?: string, guests: number, what: string }) {
  const { state, dispatch, currentUser } = useTampisaw()
  const { t } = useI18n()
  const gid = currentUser?.guestId
  const mine = state.waitlist.find(
    (w) => w.guestId === gid && w.date === date && w.slotId === slotId && w.cottageId === cottageId && w.status !== "expired",
  )
  if (!currentUser || currentUser.role !== "guest" || !gid)
    return (
      <p className="mt-2 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-900">
        {t("waitlist.fullLogin", { what })} <Link className="font-bold underline" to="/login">{t("waitlist.login")}</Link> {t("waitlist.toJoin")}
      </p>
    )
  if (mine)
    return (
      <p className="mt-2 rounded-xl bg-success-50 p-3 text-xs font-semibold leading-5 text-success-800">
        {t("waitlist.on", { what, date: prettyDate(date) })}
      </p>
    )
  return (
    <div className="mt-2 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-900">
      <p>
        {t("waitlist.offer", { what, date: prettyDate(date), guests: guests === 1 ? t("waitlist.guestOne") : t("waitlist.guestMany", { n: guests }), name: currentUser.name, phone: currentUser.phone })} {t("privacy.sim")}
      </p>
      <Button
        className="mt-2"
        variant="secondary"
        onClick={() => dispatch({ type: "JOIN_WAITLIST", entry: { guestId: gid, name: currentUser.name, phone: currentUser.phone, date, slotId, cottageId, guests } })}
      >
        {t("waitlist.join")}
      </Button>
    </div>
  )
}

/** The guest's waitlist entries with a leave button. */
export function MyWaitlist() {
  const { state, dispatch, currentUser } = useTampisaw()
  const { t } = useI18n()
  const mine = state.waitlist.filter((w) => w.guestId === currentUser?.guestId)
  if (!mine.length) return null
  const slotKeys: Record<string, TKey> = { "day-tour": "waitlist.slot.day-tour", "night-swim": "waitlist.slot.night-swim", "room-stay": "waitlist.slot.room-stay", event: "waitlist.slot.event" }
  return (
    <Card className="mb-5 p-5">
      <h2 className="text-lg font-extrabold">{t("waitlist.my")}</h2>
      <div className="mt-3 grid gap-3">
        {mine.map((w) => {
          const item = state.cottages.find((c) => c.id === w.cottageId)
          return (
            <div key={w.id} className="flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-extrabold">
                  {item?.name ?? t("waitlist.poolEntry")} · {slotKeys[w.slotId] ? t(slotKeys[w.slotId]) : w.slotId}
                </p>
                <p className="text-slate-600">
                  {prettyDate(w.date)} · {w.guests === 1 ? t("waitlist.guestOne") : t("waitlist.guestMany", { n: w.guests })}
                </p>
                <div className="mt-1">
                  <Badge tone={w.status === "notified" ? "green" : w.status === "expired" ? "red" : "info"}>
                    {w.status === "notified" ? t("waitlist.open") : w.status === "expired" ? t("waitlist.expired") : t("waitlist.waiting")}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2">
                {w.status === "notified" && (
                  <Link to="/book">
                    <Button>{t("waitlist.bookNow")}</Button>
                  </Link>
                )}
                <Button variant="secondary" onClick={() => dispatch({ type: "LEAVE_WAITLIST", id: w.id })}>
                  {t("waitlist.leave")}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">{t("privacy.sim")}</p>
    </Card>
  )
}
