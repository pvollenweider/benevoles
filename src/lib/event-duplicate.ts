// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What a duplicated event copies from each shift (#356). Registrations, waitlist entries and
 * the status never follow: the copy is a fresh, open shift. Every setting that changes what the
 * shift accepts does follow: capacity, minimum age, waitlist, and the role color chosen by the
 * organizer.
 */

export type DuplicableShift = {
  roleName: string
  label: string
  description: string | null
  date: Date
  startTime: string
  endTime: string
  capacity: number
  locationDetails: string | null
  contactName: string | null
  contactPhone: string | null
  instructions: string | null
  displayOrder: number
  internalNotes: string | null
  minAge: number | null
  waitlistEnabled: boolean
  colorKey: string | null
}

export function copiedShift(s: DuplicableShift) {
  return {
    roleName: s.roleName,
    label: s.label,
    description: s.description,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    capacity: s.capacity,
    status: "open" as const,
    locationDetails: s.locationDetails,
    contactName: s.contactName,
    contactPhone: s.contactPhone,
    instructions: s.instructions,
    displayOrder: s.displayOrder,
    internalNotes: s.internalNotes,
    minAge: s.minAge,
    waitlistEnabled: s.waitlistEnabled,
    colorKey: s.colorKey,
  }
}
