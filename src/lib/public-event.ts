// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Prisma } from "@/generated/prisma/client"

/**
 * What volunteers see of an event on its public page. Shared by the public API and the admin
 * preview (#370), so the preview shows exactly what will be published.
 */
export const publicEventInclude = {
  organization: { select: { name: true, slug: true, volunteerCharter: true } },
  shifts: {
    where: { status: { not: "cancelled" } },
    include: { registrations: { where: { status: "active" } } },
    orderBy: [{ date: "asc" }, { displayOrder: "asc" }, { startTime: "asc" }],
  },
  pages: {
    select: { slug: true, title: true },
    orderBy: { displayOrder: "asc" },
  },
} satisfies Prisma.EventInclude

export type PublicEventRow = Prisma.EventGetPayload<{ include: typeof publicEventInclude }>

export function toPublicEvent(event: PublicEventRow) {
  const shifts = event.shifts.map((shift) => ({
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
    status: shift.registrations.length >= shift.capacity ? "full" : shift.status,
    // Place and instructions are public; the contact person (often a personal mobile) is only
    // in the confirmation email, the reminders and the personal page of registered volunteers.
    locationDetails: shift.locationDetails,
    instructions: shift.instructions,
    displayOrder: shift.displayOrder,
    waitlistEnabled: shift.waitlistEnabled,
    minAge: shift.minAge,
    colorKey: shift.colorKey,
  }))

  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    organizationName: event.organization.name,
    description: event.description,
    location: event.location,
    startDate: event.startDate,
    endDate: event.endDate,
    publicInstructions: event.publicInstructions,
    confirmationMessage: event.confirmationMessage,
    requirePhone: event.requirePhone,
    showSchedule: event.showSchedule,
    volunteerCharter: event.organization.volunteerCharter,
    shifts,
    pages: event.pages,
  }
}
