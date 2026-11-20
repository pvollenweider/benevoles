// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What the super admin's organisations list says about each space at a glance (#1078): whether it
 * has an event in progress or coming, only past events, or none; and whether its owner ever took
 * it over. Pure and Prisma-free.
 *
 * Activity counts **published** events only, with the same rule as the operator statistics page:
 * drafts and archived events are excluded, unlisted published events are included. The list's
 * « Événements » count, next to it, still counts every event whatever its status. Event dates are
 * calendar days (`startDate`/`endDate` at midnight UTC), compared with today in the organisation's
 * time zone.
 */

/** An event's days, as "YYYY-MM-DD". */
export type EventSpan = { startDate: string; endDate: string }

export type EventActivity =
  | { kind: "ongoing" }
  | { kind: "upcoming"; startDate: string }
  | { kind: "past"; endDate: string }
  | { kind: "none" }

/** In progress if today falls within an event's days; otherwise the nearest start, or the latest end. */
export function eventActivity(events: readonly EventSpan[], today: string): EventActivity {
  if (events.length === 0) return { kind: "none" }
  if (events.some((e) => e.startDate <= today && today <= e.endDate)) return { kind: "ongoing" }
  const upcoming = events.filter((e) => e.startDate > today).map((e) => e.startDate).sort()
  if (upcoming.length > 0) return { kind: "upcoming", startDate: upcoming[0] }
  return { kind: "past", endDate: events.map((e) => e.endDate).sort().at(-1)! }
}

const DAY_MS = 86_400_000
const dayNumber = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS)

/**
 * Sort key of the « Activité » column, ascending from the most active: in progress, then the
 * soonest upcoming, then the most recent past, then no event at all.
 */
export function eventActivityRank(a: EventActivity, today: string): number {
  switch (a.kind) {
    case "ongoing": return 0
    case "upcoming": return 1 + (dayNumber(a.startDate) - dayNumber(today))
    case "past": return 1_000_000 + (dayNumber(today) - dayNumber(a.endDate))
    case "none": return 2_000_000
  }
}

/** Colour tone of the « Activité » pill; the text always carries the meaning. */
export type EventActivityTone = "ongoing" | "soon" | "later" | "past" | "none"

/** An upcoming event is « soon » when it starts within this many days (7-day badge). */
export const EVENT_ACTIVITY_SOON_DAYS = 7

/** Ongoing, within 7 days, later, past or none; the last two never get a pill. */
export function eventActivityTone(a: EventActivity, today: string): EventActivityTone {
  switch (a.kind) {
    case "ongoing": return "ongoing"
    case "past": return "past"
    case "none": return "none"
    case "upcoming": return dayNumber(a.startDate) - dayNumber(today) <= EVENT_ACTIVITY_SOON_DAYS ? "soon" : "later"
  }
}

/** The URL filter of the organisations list: spaces with an event in progress or within 30 days. */
export const ORG_ACTIVITY_FILTER = "activite-proche"
export const ORG_ACTIVITY_FILTER_HREF = `/super-admin/organizations?filtre=${ORG_ACTIVITY_FILTER}`
/** The filter keeps an ongoing event or an upcoming one starting within this many days. */
export const ORG_ACTIVITY_FILTER_DAYS = 30

/**
 * Whether the organisation's activity keeps it in the filter: an event in progress now, or one
 * starting within `days` days (30 by default, the window of the statistics page). Past events
 * never do, even recent ones.
 */
export function hasEventWithinDays(a: EventActivity, today: string, days: number = ORG_ACTIVITY_FILTER_DAYS): boolean {
  if (a.kind === "ongoing") return true
  if (a.kind !== "upcoming") return false
  return dayNumber(a.startDate) - dayNumber(today) <= days
}

/** « 12 nov. », with the year when it is not this year's. */
function dayLabel(ymd: string, todayYmd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    ...(ymd.slice(0, 4) === todayYmd.slice(0, 4) ? {} : { year: "numeric" }),
    timeZone: "UTC",
  })
}

/** Short, read under the « Activité » column header: « En cours », « Dans 3 jours, le 23 nov. », « À venir le 10 déc. ». */
export function eventActivityLabel(a: EventActivity, today: string): string {
  switch (a.kind) {
    case "ongoing": return "En cours"
    case "upcoming": {
      // Within the 7-day pill, the delay is said in words too: colour never carries it alone.
      const days = dayNumber(a.startDate) - dayNumber(today)
      if (days === 1) return `Demain, le ${dayLabel(a.startDate, today)}`
      if (days <= EVENT_ACTIVITY_SOON_DAYS) return `Dans ${days} jours, le ${dayLabel(a.startDate, today)}`
      return `À venir le ${dayLabel(a.startDate, today)}`
    }
    case "past": return `Dernier le ${dayLabel(a.endDate, today)}`
    case "none": return "Aucun événement"
  }
}

// --- Owner activation ------------------------------------------------------------------------

/**
 * An owner account of the organisation (role OWNER_ROLE). Only the expiry of its setup link is
 * read, never the link itself (stored as a hash, src/lib/token-hash.ts). Activating the account
 * (accept-invite) sets `isActive` and clears the link.
 */
export type OwnerAccount = { isActive: boolean; setupTokenExpiresAt: Date | null }

export type OwnerActivation =
  | { kind: "active" }
  /** Invited, never activated, the link still valid. */
  | { kind: "pending"; expiresAt: Date }
  /** Invited, never activated, the link expired (or none left). */
  | { kind: "expired"; expiresAt: Date | null }
  | { kind: "none" }

/**
 * Whether any owner account is active; otherwise the most hopeful invitation: a valid link (the one
 * lasting longest) before an expired one (the latest expiry).
 */
export function ownerActivation(owners: readonly OwnerAccount[], now: Date): OwnerActivation {
  if (owners.length === 0) return { kind: "none" }
  if (owners.some((o) => o.isActive)) return { kind: "active" }
  const expiries = owners.map((o) => o.setupTokenExpiresAt).filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())
  const latest = expiries[0] ?? null
  if (latest && latest.getTime() >= now.getTime()) return { kind: "pending", expiresAt: latest }
  return { kind: "expired", expiresAt: latest }
}

/** « 3 nov. » in the organisation's zone, with the year when it is not the current one. */
function instantLabel(at: Date, now: Date, timeZone: string): string {
  const year = (d: Date) => new Intl.DateTimeFormat("en", { timeZone, year: "numeric" }).format(d)
  return at.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    ...(year(at) === year(now) ? {} : { year: "numeric" }),
    timeZone,
  })
}

/** What the list says when no owner is active; null when one is. */
export function ownerActivationLabel(o: OwnerActivation, now: Date, timeZone: string): string | null {
  switch (o.kind) {
    case "active": return null
    case "pending": return `Lien d'activation valable jusqu'au ${instantLabel(o.expiresAt, now, timeZone)}`
    case "expired": return o.expiresAt ? `Propriétaire jamais activé (lien expiré le ${instantLabel(o.expiresAt, now, timeZone)})` : "Propriétaire jamais activé"
    case "none": return "Aucun compte propriétaire"
  }
}
