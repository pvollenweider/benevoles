import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"
import { z } from "zod"

const schema = z.object({
  email: z.string().email(),
})

const RESET_TTL_HOURS = 1

/**
 * POST /api/public/forgot-password
 *
 * Anti-enumeration: always returns 200 regardless of whether the email
 * exists. The email is sent only if it does, but the caller never knows
 * either way (avoids leaking which addresses are admins).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    // Bad input → still return 200 to keep the anti-enumeration guarantee.
    return NextResponse.json({ ok: true })
  }

  const user = await prisma.adminUser.findUnique({
    where: { email: parsed.data.email },
  })

  if (user && user.isActive) {
    const expiresAt = new Date(Date.now() + RESET_TTL_HOURS * 3600 * 1000)
    const created = await prisma.passwordResetToken.create({
      data: { userId: user.id, expiresAt },
    })

    await sendNotification({
      kind: "password_reset",
      recipient: { email: user.email, name: user.name },
      data: {
        userName: user.name,
        token: created.token,
        expiresAt,
      },
    })
  }

  return NextResponse.json({ ok: true })
}
