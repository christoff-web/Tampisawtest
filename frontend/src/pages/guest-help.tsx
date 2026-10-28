import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  LifeBuoy,
  Send,
  ThumbsDown,
  ThumbsUp,
  Wrench,
} from "lucide-react"
import { ImageInput } from "../components/image-input"
import { useLeaveGuard } from "../components/leave-guard"
import { useI18n, type TKey } from "../lib/i18n"
import { useState, type FormEvent, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { PublicLayout } from "../components/layouts"
import { Badge, Button, Card, Input, PageTitle, Select, useExit } from "../components/ui"
import { prettyDateTime } from "../lib/rules"
import { ConfirmDialog, useConfirm } from "../components/confirm"
import { useTampisaw } from "../store"
import type { Note } from "../types"

const incidentTypes = [
  "Injury / medical",
  "Lost item",
  "Theft",
  "Fight or disturbance",
  "Property damage",
  "Safety hazard",
  "Other",
]
const maintConcerns = [
  "Broken fixture",
  "Cleanliness",
  "No water / electricity",
  "Pool water issue",
  "Restroom / shower",
  "Furniture",
  "Other",
]
const commonAreas = [
  "Main pool",
  "Kiddie pool",
  "Restrooms",
  "Showers",
  "Grilling station",
  "Parking",
]

const incKey: Record<string, TKey> = {
  "Injury / medical": "help.incType.injury", "Lost item": "help.incType.lost", Theft: "help.incType.theft",
  "Fight or disturbance": "help.incType.fight", "Property damage": "help.incType.damage",
  "Safety hazard": "help.incType.hazard", Other: "help.incType.other",
}
const concernKey: Record<string, TKey> = {
  "Broken fixture": "help.concern.fixture", Cleanliness: "help.concern.clean", "No water / electricity": "help.concern.utilities",
  "Pool water issue": "help.concern.pool", "Restroom / shower": "help.concern.restroom", Furniture: "help.concern.furniture",
  Other: "help.concern.other",
}
const areaKey: Record<string, TKey> = {
  "Main pool": "help.area.main", "Kiddie pool": "help.area.kiddie", Restrooms: "help.area.restrooms",
  Showers: "help.area.showers", "Grilling station": "help.area.grill", Parking: "help.area.parking",
}

const textArea =
  "min-h-24 rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base font-normal outline-none focus:border-aqua-500 focus:ring-4 focus:ring-aqua-100"

const toneFor = (status: string) =>
  status === "resolved" || status === "done"
    ? "success"
    : status === "cancelled"
      ? "neutral"
      : status === "requested"
        ? "warning"
        : "info"

function Timeline({ createdAt, notes }: { createdAt: string; notes: Note[] }) {
  const { t } = useI18n()
  return (
    <ol className="mt-3 grid gap-2 border-l-2 border-aqua-100 pl-4 text-xs">
      <li>
        <span className="font-bold text-ink-900">{t("help.requestSent")}</span>
        <span className="ml-2 text-slate-400">{prettyDateTime(createdAt)}</span>
      </li>
      {notes.map((n, i) => (
        <li key={i}>
          <span className="font-bold text-ink-900">{n.by}:</span> {n.text}
          <span className="ml-2 text-slate-400">{prettyDateTime(n.at)}</span>
        </li>
      ))}
    </ol>
  )
}

function ConfirmBox({
  question,
  onYes,
  onNo,
}: {
  question: string
  onYes: () => void
  onNo: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-aqua-50 p-3">
      <p className="flex-1 text-sm font-semibold text-aqua-900">{question}</p>
      <Button onClick={onYes}>
        <ThumbsUp size={16} /> {t("help.yes")}
      </Button>
      <Button variant="secondary" onClick={onNo}>
        <ThumbsDown size={16} /> {t("help.no")}
      </Button>
    </div>
  )
}

function Item({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border p-4 sm:p-5">{children}</div>
}

export function GuestHelpPage({ admin }: { admin?: boolean } = {}) {
  void admin
  const { state, dispatch, currentUser } = useTampisaw()
  const { t } = useI18n()
  const tr = (map: Record<string, TKey>, v: string) => (map[v] ? t(map[v]) : v)
  const guestId = currentUser?.guestId
  const name = currentUser?.name ?? t("help.guest")
  const myBookings = state.bookings.filter(
    (b) =>
      b.guestId === guestId &&
      ["reserved", "confirmed", "checked-in"].includes(b.status),
  )
  const myIncidents = state.incidents.filter((i) => i.guestId === guestId)
  const myMaint = state.maintenance.filter((m) => m.guestId === guestId)

  const { ask, dialog } = useConfirm()
  const [flash, setFlash] = useState("")
  const exitFlash = useExit(flash)
  const [cancelling, setCancelling] = useState<
    { kind: "incident" | "maint"; id: string } | null
  >(null)
  const [inc, setInc] = useState({
    type: incidentTypes[0],
    location: "",
    description: "",
    photo: "",
    bookingId: "",
  })
  const { dialog: leaveDialog } = useLeaveGuard(!!(inc.location.trim() || inc.description.trim() || inc.photo), t("help.leaveGuard"))
  const [mt, setMt] = useState({
    area: commonAreas[0],
    concern: maintConcerns[0],
    details: "",
    urgent: false,
    bookingId: "",
  })
  const cottageNames = state.cottages.map((c) => c.name)

  const sendIncident = (e: FormEvent) => {
    e.preventDefault()
    ask({
      title: t("help.incConfirm.title"),
      confirmLabel: t("help.incConfirm.label"),
      body: t("help.incConfirm.body", {
        type: tr(incKey, inc.type),
        at: inc.location.trim() ? t("help.at", { location: inc.location.trim() }) : "",
        linked: inc.bookingId ? t("help.linked", { id: inc.bookingId }) : "",
      }),
      run: doSendIncident,
    })
  }
  const doSendIncident = () => {
    dispatch({
      type: "ADD_INCIDENT",
      payload: {
        guestId,
        guestName: name,
        bookingId: inc.bookingId || undefined,
        type: inc.type,
        location: inc.location.trim(),
        description:
          inc.description.trim() + (inc.photo ? ` [Photo: ${inc.photo}]` : ""),
        source: "guest",
      },
    })
    setInc({ ...inc, location: "", description: "", photo: "" })
    setFlash(t("help.incSent"))
  }
  const sendMaint = (e: FormEvent) => {
    e.preventDefault()
    ask({
      title: t("help.maintConfirm.title"),
      confirmLabel: t("help.maintConfirm.label"),
      body: t("help.maintConfirm.body", {
        concern: tr(concernKey, mt.concern).toLowerCase(),
        area: tr(areaKey, mt.area),
        booking: mt.bookingId ? t("help.bookingRef", { id: mt.bookingId }) : "",
        urgent: mt.urgent ? t("help.markedUrgent") : "",
      }),
      run: doSendMaint,
    })
  }
  const doSendMaint = () => {
    dispatch({
      type: "ADD_MAINT",
      payload: {
        guestId,
        guestName: name,
        bookingId: mt.bookingId || undefined,
        area: mt.area,
        concern: mt.concern,
        details: mt.details.trim(),
        urgent: mt.urgent,
      },
    })
    setMt({ ...mt, details: "", urgent: false })
    setFlash(t("help.maintSent"))
  }

  const confirmCancel = () => {
    if (!cancelling) return
    if (cancelling.kind === "incident")
      dispatch({
        type: "UPDATE_INCIDENT",
        id: cancelling.id,
        patch: { status: "cancelled" },
        note: "Guest cancelled the report",
        by: name,
      })
    else
      dispatch({
        type: "UPDATE_MAINT",
        id: cancelling.id,
        patch: { status: "cancelled" },
        note: "Guest cancelled the request",
        by: name,
      })
    setFlash(t("help.cancelled", { id: cancelling.id }))
    setCancelling(null)
  }

  const bookingSelect = (
    value: string,
    onChange: (v: string) => void,
  ) => (
    <Select
      label={t("help.linkedBooking")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{t("help.noLinked")}</option>
      {myBookings.map((b) => (
        <option key={b.id} value={b.id}>
          {b.id} · {b.date} · {b.status}
        </option>
      ))}
    </Select>
  )

  return (
    <PublicLayout>
      {leaveDialog}
      <main className="mx-auto max-w-6xl px-4 py-9 sm:px-6 lg:px-8">
        <PageTitle
          eyebrow={t("help.eyebrow")}
          title={t("help.title")}
          description={t("help.desc")}
          action={
            <Link to="/my-bookings">
              <Button variant="secondary">{t("help.backToBookings")}</Button>
            </Link>
          }
        />
        {exitFlash.value && (
          <p
            role="status"
            className={`${exitFlash.leaving ? "animate-slide-out" : "animate-slide-in"} mb-5 flex items-center gap-2 rounded-xl bg-success-50 p-3 text-sm font-bold text-success-800`}
          >
            <CheckCircle2 size={16} /> {exitFlash.value}
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5 sm:p-7">
            <h2 className="flex items-center gap-2 text-xl font-extrabold">
              <AlertTriangle className="text-warning-600" size={20} /> {t("help.reportIncident")}
            </h2>
            <form className="mt-5 grid gap-4" onSubmit={sendIncident}>
              <Select
                label={t("help.incidentType")}
                value={inc.type}
                onChange={(e) => setInc({ ...inc, type: e.target.value })}
              >
                {incidentTypes.map((it) => (
                  <option key={it} value={it}>{tr(incKey, it)}</option>
                ))}
              </Select>
              <Input
                label={t("help.location")}
                placeholder={t("help.locationPh")}
                required
                value={inc.location}
                onChange={(e) => setInc({ ...inc, location: e.target.value })}
              />
              <label className="grid gap-2 text-sm font-semibold text-ink-800">
                {t("help.whatHappened")}
                <textarea
                  className={textArea}
                  required
                  value={inc.description}
                  onChange={(e) =>
                    setInc({ ...inc, description: e.target.value })
                  }
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-ink-800">
                {t("help.photoOpt")}
                <ImageInput
                  onPick={(f) => setInc({ ...inc, photo: f?.name || "" })}
                  className="rounded-xl border border-dashed border-aqua-300 bg-aqua-50 p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-aqua-700 file:px-3 file:py-2 file:font-bold file:text-white"
                />
              </label>
              {bookingSelect(inc.bookingId, (v) =>
                setInc({ ...inc, bookingId: v }),
              )}
              <Button type="submit">
                <Send size={16} /> {t("help.submitIncident")}
              </Button>
            </form>
          </Card>
          <Card className="p-5 sm:p-7">
            <h2 className="flex items-center gap-2 text-xl font-extrabold">
              <Wrench className="text-aqua-700" size={20} /> {t("help.callMaintenance")}
            </h2>
            <form className="mt-5 grid gap-4" onSubmit={sendMaint}>
              <Select
                label={t("help.cottageArea")}
                value={mt.area}
                onChange={(e) => setMt({ ...mt, area: e.target.value })}
              >
                <optgroup label={t("help.cottagesRooms")}>
                  {cottageNames.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </optgroup>
                <optgroup label={t("help.commonAreas")}>
                  {commonAreas.map((n) => (
                    <option key={n} value={n}>{tr(areaKey, n)}</option>
                  ))}
                </optgroup>
              </Select>
              <Select
                label={t("help.concernLabel")}
                value={mt.concern}
                onChange={(e) => setMt({ ...mt, concern: e.target.value })}
              >
                {maintConcerns.map((c) => (
                  <option key={c} value={c}>{tr(concernKey, c)}</option>
                ))}
              </Select>
              <label className="grid gap-2 text-sm font-semibold text-ink-800">
                {t("help.details")}
                <textarea
                  className={textArea}
                  required
                  value={mt.details}
                  onChange={(e) => setMt({ ...mt, details: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-3 rounded-xl bg-sand-100 p-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={mt.urgent}
                  onChange={(e) => setMt({ ...mt, urgent: e.target.checked })}
                />
                {t("help.urgentLabel")}
              </label>
              {bookingSelect(mt.bookingId, (v) =>
                setMt({ ...mt, bookingId: v }),
              )}
              <Button type="submit">
                <Send size={16} /> {t("help.callMaintenance")}
              </Button>
            </form>
          </Card>
        </div>

        <h2 className="mb-4 mt-10 flex items-center gap-2 text-2xl font-extrabold">
          <LifeBuoy size={22} className="text-aqua-700" /> {t("help.myRequests")}
        </h2>
        <div className="grid gap-4">
          {myIncidents.map((i) => (
            <Item key={i.id}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-extrabold">
                  {i.id} · {tr(incKey, i.type)}
                </p>
                <Badge tone={toneFor(i.status)}>{t(`help.inc.${i.status}` as TKey)}</Badge>
                {i.guestConfirmed && <Badge tone="success">{t("help.closed")}</Badge>}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {i.location}: {i.description}
              </p>
              <Timeline createdAt={i.createdAt} notes={i.notes} />
              {i.status === "requested" && (
                <Button
                  variant="ghost"
                  className="mt-3 text-danger-600"
                  onClick={() => setCancelling({ kind: "incident", id: i.id })}
                >
                  {t("help.cancelReport")}
                </Button>
              )}
              {i.status === "resolved" && !i.guestConfirmed && (
                <ConfirmBox
                  question={t("help.resolvedQ")}
                  onYes={() =>
                    ask({
                      title: t("help.resolvedConfirm.title"),
                      confirmLabel: t("help.resolvedConfirm.label"),
                      body: t("help.resolvedConfirm.body", { id: i.id }),
                      run: () =>
                        dispatch({
                          type: "UPDATE_INCIDENT",
                          id: i.id,
                          patch: { guestConfirmed: true },
                          note: "Guest confirmed resolved",
                          by: name,
                        }),
                    })
                  }
                  onNo={() =>
                    ask({
                      title: t("help.notResolved.title"),
                      confirmLabel: t("help.notResolved.label"),
                      body: t("help.notResolved.body", { id: i.id }),
                      run: () =>
                        dispatch({
                          type: "UPDATE_INCIDENT",
                          id: i.id,
                          patch: { status: "in-progress", guestConfirmed: false },
                          note: "Guest says not resolved",
                          by: name,
                        }),
                    })
                  }
                />
              )}
            </Item>
          ))}
          {myMaint.map((m) => (
            <Item key={m.id}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-extrabold">
                  {m.id} · {tr(concernKey, m.concern)}
                </p>
                <Badge tone={toneFor(m.status)}>{t(`help.maint.${m.status}` as TKey)}</Badge>
                {m.urgent && <Badge tone="danger">{t("help.urgent")}</Badge>}
                {m.guestConfirmed && <Badge tone="success">{t("help.closed")}</Badge>}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {tr(areaKey, m.area)}
                {m.details ? `: ${m.details}` : ""}
                {m.assignedTo ? t("help.assignedTo", { name: m.assignedTo }) : ""}
              </p>
              <Timeline createdAt={m.createdAt} notes={m.notes} />
              {m.status === "requested" && (
                <Button
                  variant="ghost"
                  className="mt-3 text-danger-600"
                  onClick={() => setCancelling({ kind: "maint", id: m.id })}
                >
                  {t("help.cancelRequest")}
                </Button>
              )}
              {m.status === "done" && !m.guestConfirmed && (
                <ConfirmBox
                  question={t("help.fixedQ")}
                  onYes={() =>
                    ask({
                      title: t("help.fixedConfirm.title"),
                      confirmLabel: t("help.fixedConfirm.label"),
                      body: t("help.fixedConfirm.body", { id: m.id }),
                      run: () =>
                        dispatch({
                          type: "UPDATE_MAINT",
                          id: m.id,
                          patch: { guestConfirmed: true },
                          note: "Guest confirmed fixed",
                          by: name,
                        }),
                    })
                  }
                  onNo={() =>
                    ask({
                      title: t("help.notFixed.title"),
                      confirmLabel: t("help.notFixed.label"),
                      body: t("help.notFixed.body", { id: m.id }),
                      run: () =>
                        dispatch({
                          type: "UPDATE_MAINT",
                          id: m.id,
                          patch: { status: "on-the-way", guestConfirmed: false },
                          note: "Guest says not fixed",
                          by: name,
                        }),
                    })
                  }
                />
              )}
            </Item>
          ))}
          {!myIncidents.length && !myMaint.length && (
            <Card className="p-8 text-center text-sm text-slate-500">
              <Clock3 className="mx-auto mb-2 text-aqua-600" />
              {t("help.empty")}
            </Card>
          )}
        </div>
        <ConfirmDialog
          danger
          open={!!cancelling}
          title={
            cancelling?.kind === "incident"
              ? t("help.cancelInc.title")
              : t("help.cancelMaint.title")
          }
          confirmLabel={t("help.cancel.yes")}
          cancelLabel={t("help.cancel.keep")}
          onCancel={() => setCancelling(null)}
          onConfirm={confirmCancel}
        >
          {t("help.cancel.body", { id: cancelling?.id ?? "" })}
        </ConfirmDialog>
        {dialog}
        <p className="mt-6 flex items-center gap-2 text-xs text-slate-400">
          <Check size={13} /> {t("help.escalated")}
        </p>
      </main>
    </PublicLayout>
  )
}
