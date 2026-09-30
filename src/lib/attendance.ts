// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Lightweight check-in (#399): who came. A « Présent » mark per registration, and an attendance
 * export. Nothing else: no terminals, badges or access control.
 */

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
}

export type AttendanceTotals = { registered: number; present: number }

export function attendanceTotals(rows: { checkedInAt: Date | string | null }[]): AttendanceTotals {
  return { registered: rows.length, present: rows.filter((r) => r.checkedInAt).length }
}

/** « 12 présents sur 20 » for the page header. */
export function attendanceSummary(t: AttendanceTotals): string {
  if (t.registered === 0) return "Aucun inscrit."
  return `${t.present} présent${t.present > 1 ? "s" : ""} sur ${t.registered}`
}

const csvCell = (v: string | null | undefined) => {
  const s = (v ?? "").replace(/\r?\n/g, " ")
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

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
 * a BOM so accents open correctly. One line per registration, present ones marked.
 */
export function attendanceCsv(rows: (AttendanceRow & { answers?: string[] })[], timeZone: string, questionLabels: string[] = []): string {
  // One column per custom question of the event (#483), after the fixed ones.
  const header = ["Prénom", "Nom", "Email", "Téléphone", "Poste", "Créneau", "Date", "Début", "Fin", "Présent", "Pointé le", ...questionLabels]
  const lines = rows.map((r) => [
    r.firstName, r.lastName, r.email, r.phone, r.roleName, r.label !== r.roleName ? r.label : "", r.date, r.startTime, r.endTime,
    r.checkedInAt ? "oui" : "non", formatCheckIn(r.checkedInAt, timeZone),
    ...questionLabels.map((_, i) => r.answers?.[i] ?? ""),
  ].map(csvCell).join(";"))
  return "﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n"
}
