import { useState } from "react"
import { Check, CalendarClock } from "lucide-react"
import { Button, Input, Modal, Select } from "./ui"
import { useConfirm } from "./confirm"
import { useTampisaw } from "../store"
import { findConflict, findDuplicate, prettyDate, reservationSlots, resolveSlot } from "../pages/guest"
import { isPastDate, todayLocal } from "../pages/guest-parts"
import type { Booking } from "../types"

const CLOSED = ["cancelled", "expired", "no-show", "completed", "checked-out", "checked-in"]

/** Reschedule is a front desk / admin action; guests ask the receptionist. */
export function RescheduleButton({ booking, actor, onDone }: { booking: Booking; actor: string; onDone?: (msg: string) => void }) {
  const { state, dispatch } = useTampisaw()
  const { ask, dialog } = useConfirm()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(booking.date)
  const [slot, setSlot] = useState(booking.slotId)
  const slots = reservationSlots.filter((s) =>
    booking.type === "room" ? s.id === "room-stay" : booking.type === "event" ? s.id === "event" : s.id === "day-tour" || s.id === "night-swim",
  )
  const conflict = findConflict(state, { ...state.draft, date, slotId: slot, guests: booking.guests, type: booking.type, cottageId: booking.cottageId, eventStart: booking.eventStart }, booking.id)
  if (CLOSED.includes(booking.status)) return null
  const label = (id: string) => resolveSlot(state.slots, id)?.label ?? id
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setDate(booking.date)
          setSlot(booking.slotId)
          setOpen(true)
        }}
      >
        <CalendarClock size={18} /> Reschedule booking
      </Button>
      {dialog}
      <Modal open={open} title={`Reschedule ${booking.id}`} onClose={() => setOpen(false)}>
        <div className="grid gap-4">
          <p className="text-sm text-slate-600">
            {booking.guestName} · currently {prettyDate(booking.date)}, {label(booking.slotId)}
          </p>
          <Input
            label="New date"
            type="date"
            min={todayLocal()}
            value={date}
            error={isPastDate(date) ? "Past dates can't be booked." : undefined}
            onChange={(e) => !isPastDate(e.target.value) && setDate(e.target.value)}
          />
          <Select label="New time slot" value={slot} onChange={(e) => setSlot(e.target.value)}>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · {s.time}
              </option>
            ))}
          </Select>
          {conflict && <p className="rounded-xl bg-danger-50 p-3 text-sm font-semibold text-danger-700">{conflict}</p>}
          <Button
            disabled={!!conflict || !date || isPastDate(date) || (date === booking.date && slot === booking.slotId)}
            onClick={() => {
              const dupe = findDuplicate(state, booking.guestId, date, slot, booking.id)
              ask({
                title: dupe ? "Double booking warning" : "Reschedule this booking?",
                confirmLabel: dupe ? "Reschedule anyway" : "Yes, reschedule",
                danger: !!dupe,
                body: (
                  <div className="grid gap-2">
                    {dupe && <p className="rounded-xl bg-danger-50 p-3 font-semibold text-danger-800">This guest already has a booking on that date and time ({dupe.id}).</p>}
                    <p>
                      {booking.id} moves from <strong>{prettyDate(booking.date)}, {label(booking.slotId)}</strong> to <strong>{prettyDate(date)}, {label(slot)}</strong>. Payments already made carry over and the guest is notified.
                    </p>
                  </div>
                ),
                run: () => {
                  dispatch({ type: "RESCHEDULE", id: booking.id, date, slotId: slot, by: actor })
                  onDone?.(`${booking.id} moved to ${prettyDate(date)}.`)
                  setOpen(false)
                },
              })
            }}
          >
            <Check size={17} /> Save new schedule
          </Button>
        </div>
      </Modal>
    </>
  )
}
