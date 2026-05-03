import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const schema = z.object({
  email: z.string().email(),
  endpoint: z.string().url(),
  auth: z.string().min(1),
  p256dh: z.string().min(1),
})

// Register or refresh a push subscription
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 })
  }

  const { email, endpoint, auth, p256dh } = parsed.data

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { auth, p256dh, email },
    create: { endpoint, auth, p256dh, email },
  })

  return NextResponse.json({ ok: true })
}

// Remove a subscription
export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body?.endpoint) return NextResponse.json({ ok: true })

  await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint } }).catch(() => {})

  return NextResponse.json({ ok: true })
}

// Return the VAPID public key (needed by the client to subscribe)
export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? null
  return NextResponse.json({ publicKey })
}
