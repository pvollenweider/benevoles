// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Data export and portability (#384): what an organization can take with it. CSV for tables
 * (UTF-8 with BOM, semicolons, CRLF: opens as is in Excel), JSON for the full archive of an
 * event. Pure: the routes read through the org-scoped client and call these.
 */

export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v)
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
}

/** Every member of the organization, one row each; the notes are the admins' own, exported too. */
export function membersCsv(rows: MemberExportRow[], timeZone: string): string {
  return csvDocument(
    ["Prénom", "Nom", "Email", "Téléphone", "Étiquettes", "Actif", "Date de naissance", "Disponibilités", "Remarque de disponibilité", "Notes", "Inscriptions", "Membre depuis"],
    rows.map((r) => [
      r.firstName, r.lastName, r.email, r.phone, r.tags.join(", "), r.active ? "oui" : "non", day(r.birthDate),
      r.availabilityPeriods.join(", "), r.availabilityNote, r.notes, r.registrationCount, when(r.createdAt, timeZone),
    ]),
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

/** What the platform keeps, and for how long; the same table in the guide and the privacy page. */
export const RETENTION: { what: string; howLong: string }[] = [
  { what: "Membres, événements, créneaux, inscriptions, pages, journaux", howLong: "tant que l'organisation est active ; effacés 30 jours après sa désactivation" },
  { what: "Emails envoyés (file d'envoi)", howLong: "effacés chaque nuit une fois partis ; ceux en échec après 30 jours" },
  { what: "Comptes administrateurs désactivés", howLong: "effacés après 30 jours" },
  { what: "Sauvegardes chiffrées de la base", howLong: "30 jours sur le serveur, 90 jours en copie hors site" },
  { what: "Bénévoles sans organisation ni inscription", howLong: "effacés à chaque nettoyage nocturne" },
]
