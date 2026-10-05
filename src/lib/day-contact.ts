// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { SHIFT_CONTACT_NAME_MAX, SHIFT_CONTACT_PHONE_MAX } from "./shift-info"

/**
 * The event's day-of contact (#560): a name and a phone number, entered in the event settings,
 * shown only to registered volunteers (personal page, reminders, individual printed sheet) when
 * their shift has no contact of its own. Same limits as a shift's contact. A blank value is
 * stored as null, so « no contact » has one representation.
 */
export const DAY_CONTACT_NAME_MAX = SHIFT_CONTACT_NAME_MAX
export const DAY_CONTACT_PHONE_MAX = SHIFT_CONTACT_PHONE_MAX

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((v) => (v === undefined ? undefined : v || null))

/** Fields of the event create and update bodies. */
export const dayContactSchema = {
  dayContactName: optionalText(DAY_CONTACT_NAME_MAX),
  dayContactPhone: optionalText(DAY_CONTACT_PHONE_MAX),
}
