// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { sendMemberInvite } from "@/lib/notification-helpers"
import { rateLimit } from "@/lib/rate-limit"
import { INVITE_TEST_LIMIT, INVITE_TEST_RATE_ERROR, INVITE_TEST_WINDOW_MS, inviteTestFailure } from "@/lib/invite-test-email"
import { z } from "zod"

const schema = z.object({
  email: z.string().email(),
})

/**
 * Sends a preview of the member invitation to an address the organiser types (#1045): for the
 * organisation of the session, so a space awaiting validation can only reach its own confirmed
 * administrators, and within a small quota per organisation.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const { id: eventId } = await params

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Email invalide." }, { status: 400 })

  const event = await db.event.findFirst({
    where: { id: eventId },
    include: { organization: { select: { name: true, slug: true } } },
  })
  if (!event) return NextResponse.json({ error: "Événement introuvable." }, { status: 404 })

  const rl = await rateLimit(`org:${organizationId}`, "invitation-test", INVITE_TEST_LIMIT, INVITE_TEST_WINDOW_MS)
  if (!rl.ok) return NextResponse.json({ error: INVITE_TEST_RATE_ERROR }, { status: 429 })

  const result = await sendMemberInvite({
    to: parsed.data.email,
    memberName: "Prénom Nom",
    organizationName: event.organization.name,
    eventTitle: event.title,
    eventDate: event.startDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
    eventLocation: event.location,
    orgSlug: event.organization.slug,
    eventSlug: event.slug,
    message: "[Ceci est un email de test — les liens sont fictifs]",
    token: "test-token-preview",
    organizationId,
  })

  if (!result.ok) {
    const failure = inviteTestFailure(result)
    return NextResponse.json({ error: failure.error }, { status: failure.status })
  }
  return NextResponse.json({ ok: true })
}
