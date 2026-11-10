// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { postShiftDecline } from "@/lib/shift-decline-write"

/**
 * POST /api/public/member-invite/[token]/shift-declines/[shiftId] (#1303): « Je ne peux pas » for
 * one precise shift, from an invited member's open-shifts email. The invitation token is the
 * existing secret, never a new one. The GET-like page (/ne-peux-pas) only reads; this POST writes.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string; shiftId: string }> },
) {
  const { token, shiftId } = await params
  return postShiftDecline(req, "invitation", token, shiftId)
}
