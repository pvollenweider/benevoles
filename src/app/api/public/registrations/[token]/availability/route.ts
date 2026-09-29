// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { registrationToken } from "@/lib/token-vault"
import { validationError } from "@/lib/api-error"
import { availabilitySchema } from "@/lib/availability"

/**
 * PATCH /api/public/registrations/[token]/availability (#402): the volunteer behind a live
 * personal link sets their general availability. Same token lookup as the personal page.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(getClientIp(req), "reg-token-availability", 10, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const parsed = availabilitySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })

  const { token } = await params
  const registration = await prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: "active" },
    select: { volunteerId: true },
  })
  if (!registration) return NextResponse.json({ error: "Lien invalide ou inscription annulée." }, { status: 404 })

  const volunteer = await prisma.volunteer.update({
    where: { id: registration.volunteerId },
    data: parsed.data,
    select: { availabilityPeriods: true, availabilityNote: true },
  })
  return NextResponse.json(volunteer)
}
