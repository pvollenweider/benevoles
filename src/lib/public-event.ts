// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Prisma } from "@/generated/prisma/client"
import { orgTimeZone } from "@/lib/time-zone"
import { coordinatesOf } from "@/lib/map-link"
import { OCCUPYING_STATUSES } from "@/lib/registration-capacity"
import { ORG_LOGO_SELECT, orgLogoOf } from "@/lib/org-logo"
import { publicShifts } from "@/lib/role-assignment"
import { workloadModeOf } from "@/lib/workload-view"
import { shiftHasEnded } from "@/lib/shift-ended"

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

export function toPublicEvent(event: PublicEventRow, now: Date = new Date()) {
  const timeZone = orgTimeZone(event.organization)
  const eventPoint = coordinatesOf(event)
  // Roles assigned by the organisation only (#1145) are left out here, so of the page, its API, the
  // group links, the embeddable page and the preview alike: nothing counts or names them.
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
    }
  })

  return {
    questions: event.questions ?? [],
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
    showSchedule: event.showSchedule,
    // Both needed to show the exact charter text the sign-up route hashes (#569): resolveCharterText.
    volunteerCharter: event.organization.volunteerCharter,
    hasOrgInsurance: event.organization.hasOrgInsurance,
    shifts,
    pages: event.pages,
  }
}

/**
 * The public page's data exactly as the API sends it (#773): the event page is server-rendered
 * with it, and its client component keeps receiving dates as ISO strings, never Date objects.
 */
export function publicEventPayload(event: PublicEventRow): unknown {
  return JSON.parse(JSON.stringify(toPublicEvent(event)))
}
