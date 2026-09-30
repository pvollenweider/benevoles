// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { rateLimit } from "@/lib/rate-limit"
// The Organization row isn't a tenant-scoped model: read by its own id, from the session.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"

/**
 * Sends a test email to the admin who asks (#381): the same template as a message to
 * volunteers, so what arrives shows the sender, the reply-to and the rendering for real.
 */
export async function POST() {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { organizationId, session } = guard
  const email = session.user?.email
  if (!email) return NextResponse.json({ error: "Votre compte n'a pas d'adresse email." }, { status: 400 })

  const rl = await rateLimit(`org:${organizationId}`, "notification-test", 5, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Cinq emails de test par heure au plus. Réessayez plus tard." }, { status: 429 })

  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, slug: true, replyToEmail: true } })
  const name = session.user?.name ?? "Admin"
  const ids = await enqueueNotifications([{
    kind: "targeted_message",
    organizationId,
    recipient: { email, name },
    data: {
      volunteerName: name,
      eventTitle: `Email de test — ${org?.name ?? "votre organisation"}`,
      organizationName: org?.name ?? "",
      orgSlug: org?.slug ?? "",
      subject: "Email de test",
      message: `Cet email vérifie l'envoi depuis ${org?.name ?? "votre organisation"}.\n\nSi vous y répondez, la réponse part vers : ${org?.replyToEmail ?? "l'adresse par défaut de la plateforme"}.\n\nRien d'autre à faire.`,
      shifts: [],
    },
  }])
  deliverAfterResponse(ids)
  return NextResponse.json({ ok: true, to: email })
}
