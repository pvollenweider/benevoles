// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Data export and portability (#384): what an organization can take with it. CSV for tables
 * (UTF-8 with BOM, semicolons, CRLF: opens as is in Excel), JSON for the full archive of an
 * event. Pure: the routes read through the org-scoped client and call these.
 */

/**
 * A text cell that a spreadsheet would read as a formula (#567): it starts with = + - @, possibly
 * after whitespace (spreadsheets skip it), or with a tab or carriage return. Names, comments,
 * answers and phone numbers come from the public sign-up form, so any of them can.
 */
const FORMULA_START = /^(?:[\t\r]|\s*[=+\-@])/

/**
 * One CSV cell: text that could run as a formula is prefixed with an apostrophe (shown as text,
 * the value stays readable), then quoted when it holds a separator, a quote or a line break.
 * Numbers are written as they are: they can't hold a formula.
 */
export function csvCell(v: unknown): string {
  const raw = v === null || v === undefined ? "" : String(v)
  const s = typeof v !== "number" && FORMULA_START.test(raw) ? `'${raw}` : raw
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvDocument(header: string[], rows: unknown[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n"
}

const when = (d: Date | string | null | undefined, timeZone: string) =>
  d ? new Date(d).toLocaleString("fr-FR", { timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "")

export type MemberExportRow = {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  tags: string[]
  active: boolean
  notes: string | null
  birthDate: Date | string | null
  availabilityPeriods: string[]
  availabilityNote: string | null
  createdAt: Date | string
  registrationCount: number
  /**
   * The member's own delivery outcomes (#598): this is their own data, so the export used to
   * answer an access request includes it. Already in French words and a normalized reason — the
   * route never puts the raw SMTP reply or the address here (none of that is kept anywhere).
   */
  deliveryOutcomes?: { date: Date | string; kind: string; outcome: string; reason: string | null }[]
  /**
   * Last time this member accepted the volunteer charter at a public sign-up (#569), across all
   * their registrations; null if every one of their registrations was added by an admin by hand
   * (no volunteer consent was given there) or they have none.
   */
  charterAcceptedAt?: Date | string | null
}

/** Every member of the organization, one row each; the notes are the admins' own, exported too. */
export function membersCsv(rows: MemberExportRow[], timeZone: string): string {
  return csvDocument(
    ["Prénom", "Nom", "Email", "Téléphone", "Étiquettes", "Actif", "Date de naissance", "Disponibilités", "Remarque de disponibilité", "Notes", "Inscriptions", "Membre depuis", "Derniers envois (résultat)", "Convention acceptée (dernière fois)"],
    rows.map((r) => [
      r.firstName, r.lastName, r.email, r.phone, r.tags.join(", "), r.active ? "oui" : "non", day(r.birthDate),
      r.availabilityPeriods.join(", "), r.availabilityNote, r.notes, r.registrationCount, when(r.createdAt, timeZone),
      (r.deliveryOutcomes ?? []).map((o) => `${when(o.date, timeZone)} ${o.kind} : ${o.outcome}${o.reason ? ` (${o.reason})` : ""}`).join(" ; "),
      when(r.charterAcceptedAt, timeZone),
    ]),
  )
}

export type MemberHoursExportRow = {
  firstName: string
  lastName: string
  eventsCount: number
  shiftsCount: number
  /** Decimal hours, already split by volunteer-hours.ts's splitMinutes (planned ≠ attested, never overlapping). */
  plannedHours: number
  attestedHours: number
}

/**
 * Hours by volunteer for a period (#557): one line per member with at least one confirmed shift in
 * the period (or every member, when the caller asked to include those without one — `rows` already
 * reflects that choice), plus a total line for the organization.
 */
export function memberHoursCsv(rows: MemberHoursExportRow[]): string {
  const total = rows.reduce(
    (acc, r) => ({ shiftsCount: acc.shiftsCount + r.shiftsCount, plannedHours: acc.plannedHours + r.plannedHours, attestedHours: acc.attestedHours + r.attestedHours }),
    { shiftsCount: 0, plannedHours: 0, attestedHours: 0 },
  )
  return csvDocument(
    ["Prénom", "Nom", "Événements", "Créneaux", "Heures planifiées", "Heures attestées"],
    [
      ...rows.map((r) => [r.firstName, r.lastName, r.eventsCount, r.shiftsCount, r.plannedHours, r.attestedHours]),
      ["Total", "", "", total.shiftsCount, total.plannedHours, total.attestedHours],
    ],
  )
}

export type ActivityExportRow = {
  createdAt: Date | string
  actorType: string
  actorLabel: string
  action: string
  entityType: string
  entityId: string
  changes: unknown
}

/** The organization's activity log, oldest first, one line per entry, changes as JSON. */
export function activityCsv(rows: ActivityExportRow[], timeZone: string): string {
  return csvDocument(
    ["Date", "Acteur", "Type d'acteur", "Action", "Entité", "Identifiant", "Changements"],
    rows.map((r) => [when(r.createdAt, timeZone), r.actorLabel, r.actorType, r.action, r.entityType, r.entityId, r.changes ? JSON.stringify(r.changes) : ""]),
  )
}

export type ArchiveInput = {
  organization: { name: string; slug: string }
  event: Record<string, unknown> & { id: string; title: string }
  shifts: (Record<string, unknown> & { id: string })[]
  registrations: (Record<string, unknown> & {
    id: string
    volunteer: Record<string, unknown> & { firstName: string; lastName: string; email: string | null; phone: string | null }
  })[]
  pages: Record<string, unknown>[]
  /** Custom sign-up questions (#483) with their answers, archived ones included. */
  questions?: Record<string, unknown>[]
  sectorLeaders: { roleName: string; name: string; email: string; createdAt: Date | string }[]
  milestones: Record<string, unknown>[]
  logs: Record<string, unknown>[]
  exportedAt: Date
}

const SECRET_KEYS = new Set(["editToken", "editTokenHash", "editTokenEnc", "editTokenLegacy", "token", "tokenHash", "tokenEnc", "tokenLegacy", "passwordHash"])

/** Removes every access token or hash: an archive is data, never a way in. */
export function stripSecrets<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripSecrets) as T
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !SECRET_KEYS.has(k)).map(([k, x]) => [k, stripSecrets(x)])) as T
  }
  return v
}

/** The whole event as one JSON document: settings, shifts, registrations with their volunteer, pages, leaders, milestones, log. */
export function eventArchive(i: ArchiveInput) {
  return stripSecrets({
    format: "benevol-event-archive",
    version: 1,
    exportedAt: i.exportedAt.toISOString(),
    organization: i.organization,
    event: i.event,
    shifts: i.shifts,
    registrations: i.registrations,
    pages: i.pages,
    questions: i.questions ?? [],
    sectorLeaders: i.sectorLeaders,
    milestones: i.milestones,
    log: i.logs,
    counts: { shifts: i.shifts.length, registrations: i.registrations.length, pages: i.pages.length, sectorLeaders: i.sectorLeaders.length, milestones: i.milestones.length, log: i.logs.length },
  })
}

/** File name safe for every OS: « fete-d-ete-2026-07-04-archive.json ». */
export function exportFileName(base: string, date: Date, ext: string): string {
  const slug = base.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "export"
  return `${slug}-${date.toISOString().slice(0, 10)}.${ext}`
}
