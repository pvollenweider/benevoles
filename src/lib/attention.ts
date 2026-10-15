// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Ce qui demande votre attention » on the dashboard (#372): situations an admin should act on,
 * derived from the data, each linking to where it's resolved. Pure: the dashboard loads the
 * facts (src/lib/attention-data.ts) and this decides what to say.
 *
 * Drafts are left out (the onboarding checklist covers setting an event up). Failed emails aren't
 * here yet: outbox rows aren't linked to an organization until #382.
 */

import { WORKLOAD_LIMITS } from "./workload"
import { shiftStaffingState } from "./staffing"

const DAY = 24 * 60 * 60 * 1000
export const UNDERFILLED_WINDOW_DAYS = 7
export const OFFER_WARNING_HOURS = 12
export const INVITE_NUDGE_DAYS = 3

export type AttentionShift = { date: Date; capacity: number; active: number; /** Minimum of people (#949); null = the same as capacity. */ minVolunteers?: number | null }
export type AttentionEvent = {
  id: string
  title: string
  startDate: Date
  endDate: Date
  shifts: (AttentionShift & { roleName: string })[]
  leaderRoles: string[]
  /** Not done and past their due day in the organisation's zone (isMilestoneOverdue), by due date. */
  overdueMilestones: OverdueMilestone[]
  /** Invited people (invited more than INVITE_NUDGE_DAYS ago) still without a confirmed shift (#481). */
  unansweredInvites: number
  /** Volunteers with a workload warning on this event (#465). */
  overloadedVolunteers?: number
  /** Sign-up requests waiting for a decision on « Sur validation » shifts (#484). */
  pendingRequests?: number
}
/** `ownerName`: the milestone's owner (#985), null when it has none. */
export type OverdueMilestone = { title: string; ownerName: string | null }
/** Titles named in the message; the rest are counted (« et 2 autres »). */
export const OVERDUE_MILESTONES_LISTED = 3

/** « 2 jalons sont en retard : « A » (qui s'en occupe : Samira Diallo), « B ». » */
export function overdueMilestonesMessage(milestones: OverdueMilestone[]): string {
  const n = milestones.length
  const named = milestones.slice(0, OVERDUE_MILESTONES_LISTED)
    .map((m) => `« ${m.title} »${m.ownerName ? ` (qui s'en occupe : ${m.ownerName})` : ""}`)
  const rest = n - named.length
  const list = rest > 0 ? `${named.join(", ")} et ${rest} ${plural(rest, "autre", "autres")}` : named.join(", ")
  return `${n} ${plural(n, "jalon est en retard", "jalons sont en retard")} : ${list}.`
}

export type AttentionInput = {
  now: Date
  /** Published events only. */
  events: AttentionEvent[]
  /** Waitlist offers (status "offered") of the organization, with their expiry. */
  offers: { eventId: string; expiresAt: Date | null }[]
  /** Members whose current address needs checking because an important kind (confirmation,
   * waitlist offer, reminder) failed permanently (#599, owner decision 2026-10-04) — never for a
   * temporary incident alone. Org-wide, not tied to one event. */
  addressesToVerifyCount?: number
}

export type AttentionItem = {
  id: string
  severity: "high" | "medium" | "low"
  eventTitle: string
  message: string
  action: string
  href: string
}

const startOfUtcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one)

export function attentionItems({ now, events, offers, addressesToVerifyCount = 0 }: AttentionInput): AttentionItem[] {
  const today = startOfUtcDay(now)
  const items: AttentionItem[] = []

  if (addressesToVerifyCount > 0) {
    items.push({
      id: "addresses-to-verify", severity: "medium", eventTitle: "Membres",
      message: `${addressesToVerifyCount} ${plural(addressesToVerifyCount, "membre a", "membres ont")} une adresse à vérifier : un message important (confirmation, proposition de liste d'attente ou rappel) a été refusé définitivement par le serveur destinataire.`,
      action: "Voir les membres concernés", href: "/admin/members?verify=1",
    })
  }

  for (const e of events) {
    const base = `/admin/events/${e.id}`
    const ended = startOfUtcDay(e.endDate) < today

    if (ended) {
      items.push({
        id: `ended:${e.id}`, severity: "low", eventTitle: e.title,
        message: "L'événement est terminé mais toujours publié.",
        action: "L'archiver", href: base,
      })
      continue
    }

    // Shifts of the coming days that still have free spots.
    const soon = e.shifts.filter((s) => {
      const day = startOfUtcDay(s.date)
      return day >= today && day <= today + UNDERFILLED_WINDOW_DAYS * DAY && s.active < s.capacity
    })
    if (soon.length > 0) {
      const free = soon.reduce((n, s) => n + (s.capacity - s.active), 0)
      // A shift that reached its minimum (#949) can run: it isn't what makes the next two days urgent.
      // Without a minimum, a shift needs all its places, as before.
      const reached = (s: AttentionShift) => shiftStaffingState(s) === "minimum_reached"
      const within2Days = soon.some((s) => startOfUtcDay(s.date) <= today + 2 * DAY && !reached(s))
      const below = soon.filter((s) => shiftStaffingState(s) === "below_minimum").length
      const belowText = below > 0 ? `, dont ${below} sous ${plural(below, "son", "leur")} minimum` : ""
      items.push({
        id: `underfilled:${e.id}`, severity: within2Days ? "high" : "medium", eventTitle: e.title,
        message: `${soon.length} ${plural(soon.length, "créneau", "créneaux")} des ${UNDERFILLED_WINDOW_DAYS} prochains jours ${plural(soon.length, "n'est pas complet", "ne sont pas complets")}${belowText} (${free} ${plural(free, "place libre", "places libres")}).`,
        // Straight to the shifts to complete, critical first, when some have a minimum.
        action: "Voir les créneaux", href: below > 0 ? `${base}/staffing` : `${base}/shifts`,
      })
    }

    const expiring = offers.filter((o) => o.eventId === e.id && o.expiresAt
      && o.expiresAt.getTime() > now.getTime() && o.expiresAt.getTime() <= now.getTime() + OFFER_WARNING_HOURS * 60 * 60 * 1000)
    if (expiring.length > 0) {
      items.push({
        id: `offers:${e.id}`, severity: "medium", eventTitle: e.title,
        message: `${expiring.length} ${plural(expiring.length, "place proposée", "places proposées")} en liste d'attente ${plural(expiring.length, "expire", "expirent")} dans les ${OFFER_WARNING_HOURS} prochaines heures sans réponse.`,
        action: "Voir les inscriptions", href: `${base}/registrations`,
      })
    }

    const requests = e.pendingRequests ?? 0
    if (requests > 0) {
      items.push({
        id: `requests:${e.id}`, severity: "high", eventTitle: e.title,
        message: `${requests} ${plural(requests, "demande d'inscription attend", "demandes d'inscription attendent")} votre décision sur des créneaux sur validation.`,
        action: "Les traiter", href: `${base}/registrations?demandes=1`,
      })
    }

    if (e.overdueMilestones.length > 0) {
      items.push({
        id: `milestones:${e.id}`, severity: "high", eventTitle: e.title,
        message: overdueMilestonesMessage(e.overdueMilestones),
        action: "Voir les jalons", href: base,
      })
    }

    const overloaded = e.overloadedVolunteers ?? 0
    if (overloaded > 0) {
      items.push({
        id: `workload:${e.id}`, severity: "medium", eventTitle: e.title,
        message: `${overloaded} ${plural(overloaded, "bénévole a", "bénévoles ont")} une charge élevée : plus de ${WORKLOAD_LIMITS.dailyMinutes / 60} h dans la journée, ou plus de ${WORKLOAD_LIMITS.continuousMinutes / 60} h d'affilée sans vraie pause.`,
        action: "Voir les inscriptions", href: `${base}/registrations`,
      })
    }

    if (e.unansweredInvites > 0) {
      items.push({
        id: `invites:${e.id}`, severity: "medium", eventTitle: e.title,
        message: `${e.unansweredInvites} ${plural(e.unansweredInvites, "personne invitée", "personnes invitées")} il y a plus de ${INVITE_NUDGE_DAYS} jours ${plural(e.unansweredInvites, "n'a", "n'ont")} encore aucun créneau confirmé.`,
        action: "Leur écrire", href: `${base}/message?audience=invited`,
      })
    }

    const roles = [...new Set(e.shifts.map((s) => s.roleName))]
    const withoutLeader = roles.filter((r) => !e.leaderRoles.includes(r))
    if (withoutLeader.length > 0 && withoutLeader.length < roles.length) {
      // Only once the organization uses sector leaders on this event: otherwise every event
      // would nag about a feature it doesn't need.
      items.push({
        id: `leaders:${e.id}`, severity: "low", eventTitle: e.title,
        message: `${withoutLeader.length} ${plural(withoutLeader.length, "poste n'a", "postes n'ont")} pas de responsable : ${withoutLeader.join(", ")}.`,
        action: "Désigner", href: `${base}/sector-leaders`,
      })
    }

    const daysToStart = Math.round((startOfUtcDay(e.startDate) - today) / DAY)
    if (daysToStart >= 0 && daysToStart <= 7) {
      items.push({
        id: `starting:${e.id}`, severity: "low", eventTitle: e.title,
        message: daysToStart === 0 ? "L'événement commence aujourd'hui." : `L'événement commence dans ${daysToStart} ${plural(daysToStart, "jour", "jours")}.`,
        action: "Ouvrir l'événement", href: base,
      })
    }
  }

  const rank = { high: 0, medium: 1, low: 2 }
  return items.sort((a, b) => rank[a.severity] - rank[b.severity])
}
