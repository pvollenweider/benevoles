// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"

/**
 * Optional general availability of a volunteer (#402): periods of the day, plus a short note on
 * exceptions. Informational only, read by an organizer placing someone by hand. No matching, no
 * filtering, nothing asked on the public form.
 */

export const AVAILABILITY_PERIODS = [
  { id: "morning", label: "Matin" },
  { id: "afternoon", label: "Après-midi" },
  { id: "evening", label: "Soir" },
] as const

export type AvailabilityPeriod = (typeof AVAILABILITY_PERIODS)[number]["id"]
const PERIOD_IDS = AVAILABILITY_PERIODS.map((p) => p.id) as [AvailabilityPeriod, ...AvailabilityPeriod[]]

export const AVAILABILITY_NOTE_MAX = 140

export const availabilitySchema = z.object({
  availabilityPeriods: z.array(z.enum(PERIOD_IDS)).max(3).transform((a) => PERIOD_IDS.filter((p) => a.includes(p))),
  availabilityNote: z.string().trim().max(AVAILABILITY_NOTE_MAX).nullable().transform((v) => (v ? v : null)),
})
export type Availability = z.infer<typeof availabilitySchema>

export type AvailabilityLike = { availabilityPeriods?: string[] | null; availabilityNote?: string | null }

/** « Matin, soir · pas le dimanche », or "" when nothing is set. */
export function availabilityLabel(v: AvailabilityLike): string {
  const periods = AVAILABILITY_PERIODS.filter((p) => v.availabilityPeriods?.includes(p.id)).map((p) => p.label)
  const note = v.availabilityNote?.trim()
  const head = periods.length ? periods.join(", ").replace(/^(\w)/, (m) => m.toUpperCase()) : ""
  return [head, note].filter(Boolean).join(" · ")
}

export function hasAvailability(v: AvailabilityLike): boolean {
  return availabilityLabel(v).length > 0
}
