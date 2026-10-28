// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { ORG_LIFECYCLE_SELECT, orgLinksOpen } from "@/lib/org-lifecycle"
import { orgUnavailableResponse } from "@/lib/org-lifecycle-response"
import { recordTokenMiss, tokenLookupsBlocked, tokenUseAllowed } from "@/lib/token-rate-limit"
import { rateLimit } from "@/lib/rate-limit"
import { registrationToken } from "@/lib/token-vault"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { loadVolunteerSwapView } from "@/lib/shift-swap-data"
import { swapsShipped } from "@/lib/shift-swap-gate"
import {
  confirmSwap, declineSwapOffer, offerSwap, publishSwapRequest, withdrawSwapOffer, withdrawSwapRequest, SWAP_NOT_FOUND, SWAP_UNAVAILABLE, type SwapResult,
} from "@/lib/shift-swap-server"

/**
 * Shift swaps from a personal link (#1174). GET: what the personal page shows (the person's own
 * requests with « Tu cèdes / Tu reçois », the registrations they can publish, the open requests
 * they could answer, mission details only). POST: one action, never by GET, each bound to the
 * request's state and `revision`, so a replayed or double POST answers with the current state and
 * never acts twice (Codex, PR 2: an email only links to the personal page). The link's holder is
 * the actor; every request and registration named must be theirs, or of their event.
 *
 * Same lookup and rate limits as the personal page (per IP for unknown links, per link for use),
 * plus a per-person cap on publications and offers against bulk or repeated requests. Private,
 * never cached. Nothing at all until the capability is shipped (`swapsShipped`).
 */

const NO_STORE = { "Cache-Control": "private, no-store" }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const tooManyAttempts = () => json({ error: "Trop de tentatives." }, 429)
const notFound = () => json({ error: "Inscription introuvable ou déjà annulée." }, 404)

/** Publications and offers per person and day: plenty for real use, a wall against bulk requests. */
export const SWAP_PROPOSALS_PER_DAY = 10
const DAY = 24 * 60 * 60 * 1000

const id = z.string().min(1).max(64)
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish"), registrationId: id }),
  z.object({ action: z.literal("offer"), requestId: id, registrationId: id }),
  z.object({ action: z.literal("confirm"), requestId: id, revision: z.number().int().min(0) }),
  z.object({ action: z.literal("decline"), requestId: id, revision: z.number().int().min(0) }),
  z.object({ action: z.literal("withdraw_offer"), requestId: id, revision: z.number().int().min(0) }),
  z.object({ action: z.literal("withdraw"), requestId: id }),
])

async function holder(token: string) {
  return prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: { in: [...LIVE_STATUSES] } },
    select: { volunteerId: true, eventId: true, volunteer: { select: { erasedAt: true, mergedIntoId: true } }, event: { select: { organization: { select: ORG_LIFECYCLE_SELECT } } } },
  })
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (await tokenLookupsBlocked(req)) return tooManyAttempts()
  const { token } = await params
  const h = await holder(token)
  if (!h) {
    await recordTokenMiss(req)
    return notFound()
  }
  if (!orgLinksOpen(h.event.organization)) return orgUnavailableResponse()
  if (!(await tokenUseAllowed(token, "swaps"))) return tooManyAttempts()
  if (!swapsShipped() || h.volunteer.erasedAt || h.volunteer.mergedIntoId) return json({ enabled: false, publishable: [], mine: [], offers: [], ownShifts: {} })
  return json(await loadVolunteerSwapView(h.eventId, h.volunteerId))
}

const answer = (r: SwapResult) => (r.ok ? json(r) : json({ error: r.error, status: r.status, code: r.code }, r.httpStatus))

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (await tokenLookupsBlocked(req)) return tooManyAttempts()
  const { token } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json({ error: "Action inconnue." }, 400)
  const h = await holder(token)
  if (!h) {
    await recordTokenMiss(req)
    return notFound()
  }
  if (!orgLinksOpen(h.event.organization)) return orgUnavailableResponse()
  if (!(await tokenUseAllowed(token, "swap"))) return tooManyAttempts()
  if (!swapsShipped()) return json({ error: SWAP_UNAVAILABLE, code: "unavailable" }, 403)
  const body = parsed.data
  const volunteerId = h.volunteerId

  // A request of another event answers as unknown, whoever holds it.
  if ("requestId" in body) {
    const req = await prisma.shiftSwapRequest.findFirst({ where: { id: body.requestId, eventId: h.eventId }, select: { id: true } })
    if (!req) return json({ error: SWAP_NOT_FOUND }, 404)
  }
  if ("registrationId" in body) {
    const own = await prisma.registration.findFirst({ where: { id: body.registrationId, volunteerId, eventId: h.eventId }, select: { id: true } })
    if (!own) return notFound()
  }
  if (body.action === "publish" || body.action === "offer") {
    const allowance = await rateLimit(volunteerId, "swap-proposal", SWAP_PROPOSALS_PER_DAY, DAY)
    if (!allowance.ok) return json({ error: "Trop de demandes d'échange aujourd'hui. Réessaie demain." }, 429)
  }

  switch (body.action) {
    case "publish": return answer(await publishSwapRequest(prisma, { registrationId: body.registrationId, volunteerId }))
    case "offer": return answer(await offerSwap(prisma, { requestId: body.requestId, registrationId: body.registrationId, volunteerId }))
    case "confirm": return answer(await confirmSwap(prisma, { requestId: body.requestId, volunteerId, revision: body.revision }))
    case "decline": return answer(await declineSwapOffer(prisma, { requestId: body.requestId, volunteerId, revision: body.revision }))
    case "withdraw_offer": return answer(await withdrawSwapOffer(prisma, { requestId: body.requestId, volunteerId, revision: body.revision }))
    case "withdraw": return answer(await withdrawSwapRequest(prisma, { requestId: body.requestId, volunteerId }))
  }
}
