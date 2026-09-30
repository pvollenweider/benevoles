// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Member activity (#488): a factual chronology of one member of the organisation, built only
 * from data that already exists (invitations, registrations, check-ins, sector-leader
 * assignments, the organisation's activity log). No score, no rating, no inference: facts with
 * their date and the event they belong to. Pure; the loader reads the sources.
 */

export type ActivityFact = {
  at: Date
  kind: "invited" | "invite_used" | "registered" | "waitlisted" | "cancelled" | "present" | "leader" | "profile"
  text: string
  eventId?: string
  eventTitle?: string
}

export type ActivitySources = {
  invites: { sentAt: Date; usedAt: Date | null; event: { id: string; title: string } }[]
  registrations: {
    createdAt: Date
    updatedAt: Date
    status: string
    checkedInAt: Date | null
    shift: { roleName: string; label: string; date: Date }
    event: { id: string; title: string }
  }[]
  leaders: { createdAt: Date; roleName: string; event: { id: string; title: string } }[]
  orgLog: { createdAt: Date; action: string }[]
}

const day = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "long" })
const shiftName = (s: { roleName: string; label: string; date: Date }) => `${s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName} (${day(s.date)})`

const PROFILE_ACTIONS: Record<string, string> = {
  "member.created": "Fiche créée",
  "member.updated": "Fiche modifiée",
  "member.deactivated": "Fiche désactivée",
  "member.imported": "Importé",
}

/** The member's facts, newest first. */
export function memberTimeline(s: ActivitySources): ActivityFact[] {
  const facts: ActivityFact[] = []
  for (const i of s.invites) {
    facts.push({ at: i.sentAt, kind: "invited", text: "Invité", eventId: i.event.id, eventTitle: i.event.title })
    if (i.usedAt) facts.push({ at: i.usedAt, kind: "invite_used", text: "A ouvert son invitation", eventId: i.event.id, eventTitle: i.event.title })
  }
  for (const r of s.registrations) {
    const base = { eventId: r.event.id, eventTitle: r.event.title }
    const name = shiftName(r.shift)
    if (r.status === "waiting" || r.status === "offered") facts.push({ at: r.createdAt, kind: "waitlisted", text: `En liste d'attente : ${name}`, ...base })
    else facts.push({ at: r.createdAt, kind: "registered", text: `Inscrit : ${name}`, ...base })
    if (r.status === "cancelled") facts.push({ at: r.updatedAt, kind: "cancelled", text: `Inscription annulée : ${name}`, ...base })
    if (r.checkedInAt) facts.push({ at: r.checkedInAt, kind: "present", text: `Présent : ${name}`, ...base })
  }
  for (const l of s.leaders) facts.push({ at: l.createdAt, kind: "leader", text: `Responsable du poste « ${l.roleName} »`, eventId: l.event.id, eventTitle: l.event.title })
  for (const o of s.orgLog) {
    const text = PROFILE_ACTIONS[o.action]
    if (text) facts.push({ at: o.createdAt, kind: "profile", text })
  }
  return facts.sort((a, b) => b.at.getTime() - a.at.getTime())
}

/** A short factual summary: events taken part in and check-ins, never a score. */
export function activitySummary(s: ActivitySources): string {
  const events = new Set(s.registrations.filter((r) => r.status === "active").map((r) => r.event.id)).size
  const present = s.registrations.filter((r) => r.checkedInAt).length
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`
  return `${plural(events, "événement", "événements")} avec une inscription confirmée, ${plural(present, "présence pointée", "présences pointées")}.`
}
