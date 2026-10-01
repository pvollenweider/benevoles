// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { ShiftRef } from "@/lib/registrations-list"

export type Volunteer = {
  id: string; firstName: string; lastName: string; email: string | null; phone: string | null
  /** Optional general availability (#402), for manual placement. */
  availabilityPeriods?: string[]; availabilityNote?: string | null
}
export type Registration = {
  id: string; status: string; source: string; comment: string | null
  // Phone given on the public form for this registration; shown before the profile's.
  phone?: string | null
  createdAt: string; waitingPosition: number | null; volunteer: Volunteer; shift: ShiftRef
  // True when this volunteer is already the (or a) sector leader of this shift's own role —
  // computed server-side from SectorLeader (role + email), see registrations/page.tsx.
  isLeader: boolean
  /** Lightweight check-in (#399): when the organizer marked this person present. */
  checkedInAt?: string | null
}

/** The fields of the manual addition form. */
export type AddFormValues = { firstName: string; lastName: string; email: string; phone: string; shiftId: string; comment: string }

export const EMPTY_ADD_FORM: AddFormValues = { firstName: "", lastName: "", email: "", phone: "", shiftId: "", comment: "" }

export const shiftName = (r: Registration) => (r.shift.label !== r.shift.roleName ? `${r.shift.roleName} · ${r.shift.label}` : r.shift.label)
export const personName = (r: Registration) => `${r.volunteer.firstName} ${r.volunteer.lastName}`
