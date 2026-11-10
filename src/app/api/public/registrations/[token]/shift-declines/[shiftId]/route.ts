// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { postShiftDecline } from "@/lib/shift-decline-write"

/**
 * POST /api/public/registrations/[token]/shift-declines/[shiftId] (#1303): the same answer for a
 * member already registered on the event, through the personal link (a live registration token)
 * that their open-shifts email carries. No MemberInvite is created for them: they never enter the
 * invitations list, the unanswered-invite reminders nor the `invited` message audience.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string; shiftId: string }> },
) {
  const { token, shiftId } = await params
  return postShiftDecline(req, "registration", token, shiftId)
}
