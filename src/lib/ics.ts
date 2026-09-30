// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Ajouter à mon calendrier » (#480): a volunteer's confirmed shifts as a standard iCalendar file
 * (RFC 5545). Times are real instants computed in the organisation's time zone (daylight saving
 * and shifts past midnight included) and written in UTC; text is escaped and lines folded. UIDs
 * come from the registration, so re-importing updates the entry instead of duplicating it. Pure.
 */
import { toMin, toMinEnd } from "./gantt-utils"
import { localDateTimeToUtc } from "./time-zone"

export type IcsShift = {
  /** Registration id: the stable identifier of the entry. */
  registrationId: string
  eventTitle: string
  roleName: string
  label: string
  /** Calendar day, ISO or Date (only the day is used). */
  date: string | Date
  startTime: string
  endTime: string
  location?: string | null
  latitude?: number | null
  longitude?: number | null
  /** Short practical lines (place, contact, instructions). */
  details?: string[]
  /** The volunteer's personal page. */
  url: string
}

const DESCRIPTION_MAX = 800

/** RFC 5545 TEXT escaping. */
export function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
}

/** Folds a content line at 75 octets (UTF-8), continuation lines starting with a space. */
export function icsFold(line: string): string {
  const enc = new TextEncoder()
  const out: string[] = []
  let current = ""
  let size = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    const limit = out.length === 0 ? 75 : 74
    if (size + n > limit) {
      out.push(current)
      current = ""
      size = 0
    }
    current += ch
    size += n
  }
  out.push(current)
  return out.join("\r\n ")
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`
const dayOf = (d: string | Date) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10))

/** Start and end instants of a shift in the organisation's zone; an end past midnight is the next day. */
export function shiftInstants(s: Pick<IcsShift, "date" | "startTime" | "endTime">, timeZone: string): { start: Date; end: Date } {
  const base = new Date(`${dayOf(s.date)}T00:00:00Z`)
  return {
    start: localDateTimeToUtc(base, hhmm(toMin(s.startTime)), timeZone),
    end: localDateTimeToUtc(base, hhmm(toMinEnd(s.endTime, s.startTime)), timeZone),
  }
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)

export function buildIcs(shifts: IcsShift[], opts: { timeZone: string; now?: Date; host?: string }): string {
  const now = opts.now ?? new Date()
  const host = opts.host ?? "benevol.app"
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//benevol.app//Planning bénévoles//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ]
  for (const s of shifts) {
    const { start, end } = shiftInstants(s, opts.timeZone)
    const name = s.label && s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName
    const description = clip(
      [name, ...(s.details ?? []), "Si un horaire change, vous recevrez un email : téléchargez à nouveau le fichier.", `Mes inscriptions : ${s.url}`].join("\n"),
      DESCRIPTION_MAX,
    )
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.registrationId}@${host}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      "SEQUENCE:0",
      `SUMMARY:${icsEscape(`${s.eventTitle} — ${name}`)}`,
      `DESCRIPTION:${icsEscape(description)}`,
      `URL:${s.url}`,
    )
    if (s.location?.trim()) lines.push(`LOCATION:${icsEscape(s.location.trim())}`)
    if (s.latitude != null && s.longitude != null) lines.push(`GEO:${s.latitude.toFixed(6)};${s.longitude.toFixed(6)}`)
    lines.push("END:VEVENT")
  }
  lines.push("END:VCALENDAR")
  return lines.map(icsFold).join("\r\n") + "\r\n"
}
