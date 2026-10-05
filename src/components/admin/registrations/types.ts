// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { ShiftRef } from "@/lib/registrations-list"
import { spokenShift, spokenShiftName } from "@/lib/spoken-time"

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
  /** Proof of acceptance of the volunteer charter (#569): null for an "admin_manual" registration
   * (no volunteer consent was given there), see src/lib/charter-hash.ts. */
  /** Proof of charter acceptance (#569), already worded by charterAcceptanceLabel; null for a
   * registration added by an organizer or made before the proof was stored. */
  charterAcceptance?: string | null
}

/** The fields of the manual addition form. */
export type AddFormValues = { firstName: string; lastName: string; email: string; phone: string; shiftId: string; comment: string }

export const EMPTY_ADD_FORM: AddFormValues = { firstName: "", lastName: "", email: "", phone: "", shiftId: "", comment: "" }

/** « Bar, Soir »: commas, not the « · » screen readers read « point » (#582). */
export const shiftName = (r: Registration) => spokenShiftName(r.shift)
/** « Bar, Soir, samedi 4 juillet, de 10h à 12h »: tells apart two rows of the same person. */
export const shiftSpoken = (r: Registration) => spokenShift(r.shift)
export const personName = (r: Registration) => `${r.volunteer.firstName} ${r.volunteer.lastName}`
