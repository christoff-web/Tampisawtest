import { useEffect, useRef, useState } from "react"
import { Button, Modal } from "./ui"

export const TERMS_VERSION = "2026-10"

type Section = { title: string; items: string[] }

/** The booking terms every guest accepts before creating an account or confirming a booking. */
export const TERMS: Section[] = [
  {
    title: "1. About these terms",
    items: [
      "These Terms and Conditions govern every account, reservation and visit made through the Tampisaw system for Golden Pyramid Swimming Pool (\"the resort\"). By creating an account or placing a booking you confirm that you have read, understood and agree to them.",
      "The resort may update these terms. The version that applied when you booked is the one that applies to that booking.",
    ],
  },
  {
    title: "2. Accounts and passwords",
    items: [
      "You must be at least 18 years old to create an account and book. You must give your real name, a working e-mail address and a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).",
      "Your password must have at least 8 characters, one uppercase letter, one number and one special character. Keep it private: you are responsible for everything done with your account. Tell the resort immediately if you think someone else has used it.",
      "The resort may suspend or archive an account that gives false information, is used for fraud, or abuses the system. Archived accounts cannot sign in; their booking history is kept as required by law.",
    ],
  },
  {
    title: "3. Reservations, sessions and closures",
    items: [
      "A reservation is for the date, session (day swim, night swim or overnight), number of guests and space (pool entry, cottage, room, pavilion or canteen) shown in your booking summary. It is not a reservation until it appears in My bookings with a booking code.",
      "A space can be reserved by one booking at a time for a date and session. A pavilion may be reserved for different time blocks on the same day, but not for the same block twice.",
      "The resort is closed every Tuesday for disinfection. The resort may also close a date or session because of maintenance, safety, or bad weather. When that happens you will be offered a new date or a refund of what you paid for the affected booking.",
      "Maximum capacity applies. Entrance may be declined once capacity is reached, including for walk-ins.",
    ],
  },
  {
    title: "4. Rates, payment and confirmation",
    items: [
      "Prices are computed per guest category (Adult, Child, Senior Citizen, PWD) and session, plus the cottage, room, pavilion and add-ons you choose. Senior Citizen and PWD discounts follow the law and require a valid ID at the gate. Entering a wrong guest category may lead to the correct rate being charged on arrival.",
      "You can pay by cash at the resort or by E-Wallet (GCash QR). A downpayment is required to hold a reservation; the amount and the time you have to pay are shown at checkout. A booking that is not paid or confirmed within that time expires automatically and the space is released.",
      "E-Wallet payments need a clear proof of payment (JPG or PNG). Staff verify each payment. A payment that is rejected does not reserve anything; you must upload a correct proof before the deadline, and only if the space is still free.",
      "Pay only through the channels shown in the system. The resort will never ask for your password or a code sent to your phone or e-mail.",
    ],
  },
  {
    title: "5. Cancellations, changes, no-shows and refunds",
    items: [
      "You can ask to cancel or reschedule from My bookings. Cancelling within the cancellation window set by the resort (shown in the booking policies and in your booking) may reduce or remove your refund.",
      "Refunds are returned through the same method used to pay, after staff approve the request. Refundable deposits for add-ons are returned when the items come back complete and undamaged; damage or loss is deducted at the listed fee.",
      "If you do not arrive and did not cancel, the booking is marked as a no-show. Repeated no-shows or late cancellations raise your booking risk level and may require full payment up front for future bookings.",
      "Late arrival does not extend your session. Staying beyond your session or the cottage hours is charged as overtime at the published overtime rates.",
    ],
  },
  {
    title: "6. Rules of the resort",
    items: [
      "Attire: proper swimming attire is preferred. Plain white shirts and buttonless shorts are allowed; other street clothes are not.",
      "Food and drinks: outside food and drinks, including alcohol, are allowed. Free grilling stations are provided. Stoves are prohibited; \"super kalan\" is allowed in the parking area only.",
      "Sound systems are not allowed because the resort is in a residential area.",
      "Wear your wristband at all times. A lost or transferred wristband must be reported to staff; replacements may be charged and a suspected transfer is recorded as an incident.",
      "Children and non-swimmers must be supervised by an adult at all times. Lifeguards help, but they do not replace your supervision. Follow lifeguard and staff instructions and the posted pool rules.",
      "No diving in shallow areas, running on wet floors, glass containers in the pool, smoking in the pool area, or illegal drugs or weapons. Staff may refuse entry or ask a person to leave, without refund, for unsafe or abusive behavior.",
    ],
  },
  {
    title: "7. Health, safety and liability",
    items: [
      "Before your visit you will be asked to complete a health and safety waiver. Swimming involves risk. You swim, and let the guests in your group swim, at your own risk and confirm that no one in your group has a condition that makes swimming unsafe without a doctor's approval.",
      "The resort is not responsible for lost, stolen or damaged personal belongings. Keep valuables with you.",
      "You are responsible for damage caused by you or your group to the resort's property and will be charged the listed fee.",
    ],
  },
  {
    title: "8. Data privacy (RA 10173)",
    items: [
      "The resort collects your name, e-mail, mobile number, birth date, booking and payment details, and health information (only with your separate consent) to run your reservation, keep guests safe, prevent fraud and meet legal duties.",
      "Your data is stored in the resort's secured database, is seen only by authorised staff, and is not sold. The system no longer collects any selfie or camera photo. You may ask to see, correct or delete your data from My bookings > Privacy, subject to records the resort must keep for accounting.",
    ],
  },
  {
    title: "9. Acceptance",
    items: [
      "By ticking \"I agree\" you confirm that you have scrolled through and read all of these Terms and Conditions, that the information you give is true, and that you accept them for your account and for every booking you make.",
    ],
  },
]

/**
 * Scrollable Terms and Conditions. `onFinished` fires once the person has scrolled to the end and pressed "I have read the terms".
 */
export function TermsModal({ open, onClose, onFinished }: { open: boolean; onClose: () => void; onFinished: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [atEnd, setAtEnd] = useState(false)
  const check = () => {
    const el = box.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setAtEnd(true)
  }
  useEffect(() => {
    if (!open) return
    setAtEnd(false)
    const id = window.setTimeout(check, 50) // a very tall window may show everything at once
    return () => window.clearTimeout(id)
  }, [open])
  return (
    <Modal open={open} title="Terms and Conditions" onClose={onClose}>
      <p className="text-xs text-slate-500">Version {TERMS_VERSION}. Scroll to the end to continue.</p>
      <div
        ref={box}
        onScroll={check}
        tabIndex={0}
        role="region"
        aria-label="Terms and Conditions text"
        className="mt-3 max-h-[55vh] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700"
      >
        {TERMS.map((s) => (
          <section key={s.title} className="mb-4 last:mb-0">
            <h3 className="font-extrabold text-ink-900">{s.title}</h3>
            <ul className="mt-1 grid list-disc gap-1.5 pl-5">
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-500" role="status">
          {atEnd ? "You reached the end of the terms." : "Please scroll down to read all the terms."}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Close
          </Button>
          <Button type="button" disabled={!atEnd} onClick={onFinished}>
            I have read the terms
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * The agreement checkbox. It stays disabled until the Terms and Conditions were opened and scrolled to the end.
 */
export function TermsAgreement({
  checked,
  onChange,
  read,
  onRead,
  error,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  read: boolean
  onRead: () => void
  error?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="grid gap-1.5">
      <label className={`flex items-start gap-3 text-sm leading-5 ${read ? "text-ink-800" : "text-slate-400"}`}>
        <input
          type="checkbox"
          className="mt-0.5 size-4"
          disabled={!read}
          checked={checked}
          aria-describedby="terms-hint"
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>
          I have read and agree to the{" "}
          <button type="button" className="font-bold text-aqua-700 underline" onClick={() => setOpen(true)}>
            Terms and Conditions
          </button>
          .
        </span>
      </label>
      <p id="terms-hint" className="pl-7 text-xs text-slate-500">
        {read ? "Thank you for reading the terms." : "Open the Terms and Conditions and scroll to the end to enable this box."}
      </p>
      {error && (
        <p role="alert" className="pl-7 text-xs font-semibold text-danger-700">
          {error}
        </p>
      )}
      <TermsModal
        open={open}
        onClose={() => setOpen(false)}
        onFinished={() => {
          onRead()
          setOpen(false)
        }}
      />
    </div>
  )
}
