// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { env } from "@/lib/env"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { reportError } from "@/lib/report-error"
import { registrationToken } from "@/lib/token-vault"

const schema = z.object({
  editToken: z.string().min(1),
  endpoint: z.string().url(),
  auth: z.string().min(1),
  p256dh: z.string().min(1),
})

// Register or refresh a push subscription. Requires the registration's editToken: reminder
// pushes link to /my/<editToken>, so subscribing must prove the caller already holds that link
// — an email alone would let anyone receive another volunteer's management link.
export async function POST(req: Request) {
  const rl = await rateLimit(getClientIp(req), "push-subscribe", 10, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 })
  }

  const { editToken, endpoint, auth, p256dh } = parsed.data

  // Same rule as GET /api/public/registrations/[token]: only an active registration's token
  // opens the volunteer's page, so only that token can subscribe.
  const registration = await prisma.registration.findFirst({
    where: { ...registrationToken.where(editToken), status: "active" },
    select: { volunteerId: true },
  })
  if (!registration) {
    return NextResponse.json({ error: "Inscription introuvable" }, { status: 404 })
  }
  const { volunteerId } = registration

  await prisma.pushSubscription.upsert({
    where: { endpoint_volunteerId: { endpoint, volunteerId } },
    update: { auth, p256dh },
    create: { endpoint, auth, p256dh, volunteerId },
  })

  return NextResponse.json({ ok: true })
}

const unsubscribeSchema = z.object({
  editToken: z.string().min(1),
  endpoint: z.string().url(),
})

// Remove a subscription. Same proof as subscribing (audit): the caller must hold the personal
// link, and only that volunteer's subscription for this endpoint goes — an endpoint alone, if it
// leaked, would let anyone switch off someone's reminders. A cancelled registration's link still
// counts: someone who left may want the reminders to stop.
export async function DELETE(req: Request) {
  const rl = await rateLimit(getClientIp(req), "push-unsubscribe", 10, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const parsed = unsubscribeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Données invalides" }, { status: 400 })
  const { editToken, endpoint } = parsed.data

  const registration = await prisma.registration.findFirst({
    where: registrationToken.where(editToken),
    select: { volunteerId: true },
  })
  if (!registration) return NextResponse.json({ error: "Inscription introuvable" }, { status: 404 })

  await prisma.pushSubscription
    .deleteMany({ where: { endpoint, volunteerId: registration.volunteerId } })
    .catch(reportError("push.unsubscribe"))

  return NextResponse.json({ ok: true })
}

// Return the VAPID public key (needed by the client to subscribe)
export async function GET() {
  const publicKey = env.VAPID_PUBLIC_KEY ?? null
  return NextResponse.json({ publicKey })
}
