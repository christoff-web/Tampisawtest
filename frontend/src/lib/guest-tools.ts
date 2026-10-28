import type { Booking } from "../types"

export const RESORT_ADDRESS = "Golden Pyramid Swimming Pool, Pavilion Resort, Quezon City"
export const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(RESORT_ADDRESS)}`

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const pad = (n: number) => String(n).padStart(2, "0")
const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")

const parseClock = (t: string) => {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(t)
  if (!m) return null
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2])
}

/** Start and end of the booking in resort local time (Asia/Manila). */
export function bookingWindow(b: Pick<Booking, "date" | "slotId" | "eventStart" | "type">) {
  const day = new Date(`${b.date}T00:00:00`)
  const at = (mins: number, plusDays = 0) => {
    const d = new Date(day)
    d.setDate(d.getDate() + plusDays)
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
    return d
  }
  if (b.slotId === "night-swim" || b.slotId === "afternoon") return { start: at(18 * 60), end: at(2 * 60, 1) }
  if (b.slotId === "room-stay" || b.slotId === "evening" || b.type === "room") return { start: at(14 * 60), end: at(11 * 60, 1) }
  if (b.slotId === "event" || b.type === "event") {
    const s = parseClock(b.eventStart ?? "") ?? 8 * 60
    return { start: at(s), end: at(s + 240) }
  }
  return { start: at(8 * 60), end: at(16 * 60) }
}

export function buildIcs(b: Booking, spaceName?: string) {
  const { start, end } = bookingWindow(b)
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")
  const desc = `Booking ${b.id} for ${b.guests} guest${b.guests === 1 ? "" : "s"}${spaceName ? ` (${spaceName})` : ""}. Show your QR ticket at the gate and bring a valid ID.`
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tampisaw//Golden Pyramid Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@tampisaw.local`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=Asia/Manila:${stamp(start)}`,
    `DTEND;TZID=Asia/Manila:${stamp(end)}`,
    `SUMMARY:${esc("Golden Pyramid pool day")}`,
    `LOCATION:${esc(RESORT_ADDRESS)}`,
    `DESCRIPTION:${esc(desc)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Your Golden Pyramid visit is tomorrow",
    "TRIGGER:-P1D",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Your Golden Pyramid visit starts in 2 hours",
    "TRIGGER:-PT2H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n")
}
