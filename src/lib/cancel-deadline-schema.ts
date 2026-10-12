// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { CANCEL_DEADLINE_DAYS_MAX, CANCEL_DEADLINE_HOURS_MAX } from "./cancel-deadline"

/**
 * The self-cancellation deadline fields of the event create and update bodies (#946). Apart from
 * cancel-deadline.ts so that zod stays out of the public pages' JavaScript (#773). Zero is stored
 * as null, so « until the start » has one representation.
 */
const deadlinePart = (max: number) =>
  z.number().int().min(0).max(max).nullable().optional().transform((v) => (v === undefined ? undefined : v || null))

export const cancelDeadlineSchema = {
  cancelDeadlineDays: deadlinePart(CANCEL_DEADLINE_DAYS_MAX),
  cancelDeadlineHours: deadlinePart(CANCEL_DEADLINE_HOURS_MAX),
}

