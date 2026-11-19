// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { lookupOrgLink, rotateOrgLink, type OrgLinkDb } from "@/lib/org-link"
import { orgLinksOpen } from "@/lib/org-lifecycle"
import { orgUnavailableResponse } from "@/lib/org-lifecycle-response"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { recordTokenMiss, tokenLookupsBlocked, tokenUseAllowed } from "@/lib/token-rate-limit"
import { enqueueOrgLink } from "@/lib/org-link-send"
import { hashToken } from "@/lib/token-hash"
import { deliverAfterResponse } from "@/lib/notifications/outbox"
import { ORG_LINK_RENEWED_RESPONSE } from "@/lib/personal-link"
import { registrationToken } from "@/lib/token-vault"
import { generateToken } from "@/lib/utils"
import { LIVE_STATUSES } from "@/lib/registration-capacity"

const RATE_LIMITED = "Trop de tentatives. Réessaie dans une heure."

/**
 * « Renouveler mon lien » (#1429, lot A): the old token stops working in the same transaction that
 * queues the email carrying the new one. The response says an email was sent; it never contains
 * the link.
 *
 * The rotation is conditioned on the hash of the token the request PRESENTED, inside the same
 * updateMany that writes the new token — never on a hash read before the transaction. A second
 * concurrent request therefore loses the conditional update (and gets the invalid-link answer),
 * and a renewal racing an address correction cannot rotate a token that no longer exists. The
 * volunteer's address is read inside the transaction, after the update, so the email goes to the
 * address that is current at that point, not the one the initial lookup saw.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(getClientIp(req), "reg-link-resend-ip", 10, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: RATE_LIMITED }, { status: 429 })
  if (await tokenLookupsBlocked(req)) return NextResponse.json({ error: RATE_LIMITED }, { status: 429 })

  const { token } = await params
  const target = await lookupOrgLink(prisma as unknown as OrgLinkDb, token)
  if (!target) {
    await recordTokenMiss(req)
    return NextResponse.json({ error: "Ce lien ne fonctionne plus." }, { status: 404 })
  }
  if (!orgLinksOpen(target.organization)) return orgUnavailableResponse()
  if (!(await tokenUseAllowed(token, "renew"))) return NextResponse.json({ error: RATE_LIMITED }, { status: 429 })
  if (!target.email) {
    return NextResponse.json({ error: "Aucune adresse email n'est enregistrée pour tes inscriptions. Demande un nouveau lien à l'organisation." }, { status: 400 })
  }

  const result = await prisma.$transaction(async (tx) => {
    // The presented token's hash, in the updateMany itself: no read-then-write window.
    const rotated = await rotateOrgLink(tx as unknown as OrgLinkDb, {
      volunteerId: target.id,
      organizationId: target.organizationId,
      expectedHash: hashToken(token),
    })
    // Someone else already renewed (or corrected the address): this link is invalid now.
    if (!rotated) return null

    // « Voir l'événement » hands out the event links of these registrations: whoever held the old
    // organisation link may have opened them. Renewing is the answer to a leak, so those event
    // links are rotated in the same transaction; the new organisation link reaches every event.
    const live = await tx.registration.findMany({
      where: { volunteerId: target.id, status: { in: [...LIVE_STATUSES] }, event: { organizationId: target.organizationId } },
      select: { id: true },
    })
    for (const r of live) await tx.registration.update({ where: { id: r.id }, data: registrationToken.data(generateToken()) })

    // Read the address after the rotation, inside the same transaction: a correction committed
    // before this point sent us here with a stale `target`, and it must never receive the email.
    const current = await tx.volunteer.findFirst({
      where: { id: target.id, organizationId: target.organizationId },
      select: { firstName: true, lastName: true, email: true },
    })
    if (!current?.email) return []

    return enqueueOrgLink({
      kind: "org_personal_link_renewed",
      volunteer: { id: target.id, firstName: current.firstName, lastName: current.lastName, email: current.email },
      organization: { id: target.organization.id, name: target.organization.name, slug: target.organization.slug },
      link: rotated,
      db: tx,
    })
  })
  if (!result) {
    return NextResponse.json({ error: "Ce lien ne fonctionne plus." }, { status: 404 })
  }
  deliverAfterResponse(result)
  return NextResponse.json({ ok: true, message: ORG_LINK_RENEWED_RESPONSE })
}
