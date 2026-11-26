// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Prisma } from "@/generated/prisma/client"
import { orgTimeZone } from "@/lib/time-zone"
import { coordinatesOf } from "@/lib/map-link"
import { OCCUPYING_STATUSES } from "@/lib/registration-capacity"
import { ORG_LOGO_SELECT, orgLogoOf } from "@/lib/org-logo"
import { assignedOnlyRoles, publicShifts } from "@/lib/role-assignment"
import { SCOPE_ROLES } from "@/lib/question-scope"
import { workloadModeOf } from "@/lib/workload-view"
import { shiftHasEnded } from "@/lib/shift-ended"
import { reservedAnswerConditions } from "@/lib/role-answer"
import { shiftViewSetting } from "@/lib/shift-view"

/**
 * What volunteers see of an event on its public page. Shared by the public API and the admin
 * preview (#370), so the preview shows exactly what will be published. The shifts of a role
 * assigned by the organisation only (#1145) are never part of it: see `toPublicEvent`.
 */
export const publicEventInclude = {
  // The logo's metadata only (#300): the page loads the image from its own URL.
  organization: { select: { name: true, slug: true, volunteerCharter: true, hasOrgInsurance: true, timeZone: true, logo: ORG_LOGO_SELECT } },
  shifts: {
    where: { status: { not: "cancelled" } },
    // Every spot taken counts, a pending request or a waitlist offer included (#484): the page
    // agrees with the placement the server will make.
    // The place's name (#1171, lot 2): read by the recap's travel check, said in its messages.
    include: { registrations: { where: { status: { in: [...OCCUPYING_STATUSES] } } }, place: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { displayOrder: "asc" }, { startTime: "asc" }],
  },
  pages: {
    select: { slug: true, title: true },
    orderBy: { displayOrder: "asc" },
  },
  // Custom sign-up questions (#483), active ones in their order.
  questions: {
    where: { archivedAt: null },
    orderBy: { position: "asc" },
    // A follow-up (#1016) carries its parent and the answers that show it: the page hides it otherwise.
    // Its scope (#1140): the page asks it only when a chosen shift is on one of its postes.
    select: { id: true, label: true, type: true, options: true, required: true, minValue: true, maxValue: true, parentId: true, showIfValues: true, displayScope: true, displayRoleNames: true },
  },
} satisfies Prisma.EventInclude

export type PublicEventRow = Prisma.EventGetPayload<{ include: typeof publicEventInclude }>

/**
 * The questions the anonymous page receives: those scoped to postes drop the names of postes
 * assigned by the organisation only, and a question left with no poste is not published, nor are
 * its follow-ups (#1016). A person on such a poste still gets the question from their own page,
 * which reads the questions itself. Questions asked to the whole event are unchanged.
 */
export function publicQuestions<Q extends { id: string; parentId?: string | null; displayScope?: string | null; displayRoleNames?: string[] | null }>(
  questions: Q[],
  hidden: Set<string>,
): Q[] {
  if (hidden.size === 0) return questions
  const dropped = new Set<string>()
  const kept = new Map<string, Q>()
  for (const q of questions) {
    const names = q.displayRoleNames ?? []
    if (q.displayScope !== SCOPE_ROLES || !names.some((n) => hidden.has(n))) {
      kept.set(q.id, q)
      continue
    }
    const visible = names.filter((n) => !hidden.has(n))
    if (visible.length === 0) dropped.add(q.id)
    else kept.set(q.id, { ...q, displayRoleNames: visible })
  }
  // A follow-up is asked to the people its parent is asked to: it goes with a dropped parent.
  let changed = true
  while (changed) {
    changed = false
    for (const q of questions) {
      if (q.parentId && dropped.has(q.parentId) && !dropped.has(q.id)) {
        dropped.add(q.id)
        changed = true
      }
    }
  }
  return questions.filter((q) => !dropped.has(q.id)).map((q) => kept.get(q.id) ?? q)
}

export function toPublicEvent(event: PublicEventRow, now: Date = new Date()) {
  const timeZone = orgTimeZone(event.organization)
  const eventPoint = coordinatesOf(event)
  // Roles assigned by the organisation only (#1145) are left out here, so of the page, its API, the
  // group links, the embeddable page and the preview alike: nothing counts or names them.
  // Answer conditions (#962), shared by a poste's shifts: said on every one of them, never hidden.
  const answerConditions = reservedAnswerConditions(event.shifts)
  const questionById = new Map((event.questions ?? []).map((q) => [q.id, q]))
  const shifts = publicShifts(event.shifts).map((shift) => {
    // Meeting point (#191): the shift's whole pair, else the event's, never half of each.
    const point = coordinatesOf(shift) ?? eventPoint
    return {
    id: shift.id,
    roleName: shift.roleName,
    label: shift.label,
    description: shift.description,
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    capacity: shift.capacity,
    registered: shift.registrations.length,
    spotsLeft: Math.max(0, shift.capacity - shift.registrations.length),
    // Over (end passed, organisation time zone): « Terminé », never selectable, the sign-up refuses
    // it too. Before « full »: a full shift that ended is no waitlist to join.
    status: shiftHasEnded(shift, now, timeZone) ? "ended" : shift.registrations.length >= shift.capacity ? "full" : shift.status,
    // Place and instructions are public; the contact person (often a personal mobile) is only
    // in the confirmation email, the reminders and the personal page of registered volunteers.
    locationDetails: shift.locationDetails,
    instructions: shift.instructions,
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
    displayOrder: shift.displayOrder,
    waitlistEnabled: shift.waitlistEnabled,
    requiresApproval: shift.requiresApproval,
    minAge: shift.minAge,
    // « Repas sur le pouce possible » (#1171, lot 2): said to the volunteer before signing up, and
    // read by the recap's workload check.
    mealOnTheGo: shift.mealOnTheGo,
    // Place of the mission (#1171, lot 2): its id and name, for the recap's travel check.
    placeId: shift.placeId,
    placeName: shift.place?.name ?? null,
    colorKey: shift.colorKey,
    maxPerVolunteer: shift.maxPerVolunteer,
    // Role cumulable with another shift (#986): the page does not mark its overlaps as conflicts.
    overlapAllowed: shift.overlapAllowed,
    // Reserved to some members (#470): the public page says so, never which tags.
    reserved: (shift.reservedTags ?? []).length > 0,
    // Reserved to an answer (#962): the condition is public, the page says it and the sign-up checks it.
    reservedAnswer: (() => {
      const condition = answerConditions.get(shift.roleName)
      if (!condition) return null
      return { questionId: condition.questionId, questionLabel: questionById.get(condition.questionId)?.label ?? "Question de l'inscription", answers: condition.answers }
    })(),
    }
  })

  return {
    questions: publicQuestions(event.questions ?? [], assignedOnlyRoles(event.shifts)),
    id: event.id,
    slug: event.slug,
    title: event.title,
    organizationName: event.organization.name,
    organizationLogo: orgLogoOf(event.organizationId, event.organization.logo),
    description: event.description,
    location: event.location,
    latitude: eventPoint?.latitude ?? null,
    longitude: eventPoint?.longitude ?? null,
    startDate: event.startDate,
    endDate: event.endDate,
    publicInstructions: event.publicInstructions,
    confirmationMessage: event.confirmationMessage,
    requirePhone: event.requirePhone,
    // Confirmation by email (#1253): the form says so, and the result page reads it.
    requireEmailConfirmation: event.requireEmailConfirmation,
    // Shift roster (#1068): whether the form offers the optional « show my name » box.
    shiftRosterEnabled: event.shiftRosterEnabled,
    // Registration window (#463): the page shows the schedule either way, the form only when open.
    registrationsOpen: event.registrationsOpen,
    registrationOpensAt: event.registrationOpensAt,
    registrationClosesAt: event.registrationClosesAt,
    timeZone: orgTimeZone(event.organization),
    // Workload (#465, #1171): the #465 warnings, or the event's protection limits, which the sign-up
    // recap applies to the shifts chosen (and to those held, from the personal link). The limits are
    // the event's rules, not anyone's data.
    workload: workloadModeOf(event, orgTimeZone(event.organization)),
    accentColorKey: event.accentColorKey,
    // Default view of the shifts (#1407): the public page applies it under the visitor's choice.
    publicShiftView: shiftViewSetting(event.publicShiftView),
    showSchedule: event.showSchedule,
    // Both needed to show the exact charter text the sign-up route hashes (#569): resolveCharterText.
    volunteerCharter: event.organization.volunteerCharter,
    hasOrgInsurance: event.organization.hasOrgInsurance,
    shifts,
    // Never the postes a page is attached to (#1324): the link is for the confirmed volunteers
    // reached with a personal or leader link, and for emails. Pick the two public fields here, so
    // a wider query can never leak `roleNames` into the page, its API, the embed or the preview.
    pages: event.pages.map((p) => ({ slug: p.slug, title: p.title })),
  }
}

/**
 * The public page's data exactly as the API sends it (#773): the event page is server-rendered
 * with it, and its client component keeps receiving dates as ISO strings, never Date objects.
 */
export function publicEventPayload(event: PublicEventRow): unknown {
  return JSON.parse(JSON.stringify(toPublicEvent(event)))
}
