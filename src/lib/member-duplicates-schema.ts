// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import type { SignalKind } from "./member-duplicates"

const SIGNAL_KINDS: SignalKind[] = ["name", "phone", "email", "address_to_verify", "birth_date"]

/** Body of POST /api/admin/members/duplicates/dismiss (#601): the pair and the signal kinds the
 * client showed for it — the route recomputes the fingerprint itself, never trusts a client value. */
export const dismissDuplicateSchema = z.object({
  volunteerIdA: z.string().min(1),
  volunteerIdB: z.string().min(1),
  signals: z.array(z.enum(SIGNAL_KINDS as [SignalKind, ...SignalKind[]])).min(1),
})

export type DismissDuplicateBody = z.infer<typeof dismissDuplicateSchema>
