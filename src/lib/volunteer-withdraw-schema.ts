// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { WITHDRAWAL_MESSAGE_MAX } from "./volunteer-withdraw"

/**
 * Body of the DELETE request: the optional message, trimmed and length-checked (301 → 400). Apart
 * from volunteer-withdraw.ts so that zod stays out of the public pages' JavaScript (#773).
 */
export const withdrawRequestSchema = z.object({
  message: z.string().trim().max(WITHDRAWAL_MESSAGE_MAX).optional(),
})
