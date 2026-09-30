// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { registrationToken } from "@/lib/token-vault"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { linkTargetInclude, LIVE_STATUSES, sendPersonalLink } from "@/lib/personal-link-send"
import { LINK_RESENT_RESPONSE, LINK_THROTTLED_RESPONSE } from "@/lib/personal-link"

/** From the personal page (#376): email me my link again, so I have it in my inbox. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(getClientIp(req), "reg-link-resend-ip", 10, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const { token } = await params
  const reg = await prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: { in: [...LIVE_STATUSES] } },
    include: linkTargetInclude,
  })
  if (!reg) return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })

  const outcome = await sendPersonalLink(reg)
  if (outcome === "no_email") return NextResponse.json({ error: "Aucune adresse email n'est enregistrée pour cette inscription." }, { status: 400 })
  if (outcome === "throttled") return NextResponse.json({ error: LINK_THROTTLED_RESPONSE }, { status: 429 })
  return NextResponse.json({ ok: true, message: LINK_RESENT_RESPONSE })
}
