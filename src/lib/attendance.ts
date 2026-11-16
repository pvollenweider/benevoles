// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Lightweight check-in (#399): who came. A « Présent » mark per registration, an « Absent » one
 * when an organizer recorded that the person did not come (#1141), and an attendance export.
 * Nothing else: no terminals, badges or access control.
 */

import { csvDocument } from "./data-export"
import { attendanceStateOf } from "./attendance-state"

export type AttendanceRow = {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  roleName: string
  label: string
  /** "YYYY-MM-DD" */
  date: string
  startTime: string
  endTime: string
  checkedInAt: Date | null
  /** "absent" when the absence was recorded (#1141); null or missing otherwise. */
  attendanceStatus?: string | null
}

export type AttendanceTotals = { registered: number; present: number; absent: number }

export function attendanceTotals(rows: { checkedInAt: Date | string | null; attendanceStatus?: string | null }[]): AttendanceTotals {
  const states = rows.map(attendanceStateOf)
  return { registered: rows.length, present: states.filter((s) => s === "present").length, absent: states.filter((s) => s === "absent").length }
}

/** « 12 présents sur 20 », or « 12 présents sur 20, 2 absents », for the page header. */
export function attendanceSummary(t: AttendanceTotals): string {
  if (t.registered === 0) return "Aucun inscrit."
  const line = `${t.present} présent${t.present > 1 ? "s" : ""} sur ${t.registered}`
  return t.absent > 0 ? `${line}, ${t.absent} absent${t.absent > 1 ? "s" : ""}` : line
}

// One line per registration: line breaks in a value (a comment, an answer) become spaces.
const oneLine = (v: string | null | undefined) => (v ?? "").replace(/\r?\n/g, " ")

/** Time of the check-in in the organization's time zone, "HH:MM", for the export. */
export function formatCheckIn(d: Date | null, timeZone: string): string {
  if (!d) return ""
  // Assembled from parts: locale output varies (separators, non-breaking spaces) across runtimes.
  const parts = new Intl.DateTimeFormat("fr-CH", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`
}

/**
 * The attendance sheet as CSV: semicolon-separated (what Excel expects in French locales), with
 * a BOM so accents open correctly. One line per registration, present ones marked. « Présent »
 * keeps its values (oui / non) and its place, so existing spreadsheets still read it; a recorded
 * absence (#1141) has its own column, « Absence notée », right after « Pointé le ».
 */
export function attendanceCsv(rows: (AttendanceRow & { answers?: string[] })[], timeZone: string, questionLabels: string[] = []): string {
  // One column per custom question of the event (#483), after the fixed ones.
  const header = ["Prénom", "Nom", "Email", "Téléphone", "Poste", "Créneau", "Date", "Début", "Fin", "Présent", "Pointé le", "Absence notée", ...questionLabels]
  const lines = rows.map((r) => [
    r.firstName, r.lastName, r.email, r.phone, r.roleName, r.label !== r.roleName ? r.label : "", r.date, r.startTime, r.endTime,
    r.checkedInAt ? "oui" : "non", formatCheckIn(r.checkedInAt, timeZone), attendanceStateOf(r) === "absent" ? "oui" : "",
    ...questionLabels.map((_, i) => r.answers?.[i] ?? ""),
  ].map(oneLine))
  // The shared serializer escapes and neutralises formulas (#567), question labels included.
  return csvDocument(header.map(oneLine), lines)
}
