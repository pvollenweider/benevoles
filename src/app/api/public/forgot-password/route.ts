import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}))
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Email invalide." }, { status: 400 })
  }

  const admin = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase().trim() } })

  // Always return 200 to avoid user enumeration
  if (!admin || !admin.isActive) {
    return NextResponse.json({ ok: true })
  }

  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordResetToken: token, passwordResetExpiresAt: expiresAt },
  })

  const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")
  const resetUrl = `${APP_URL}/admin/reset-password?token=${token}`

  await sendNotification({
    kind: "password_reset",
    recipient: { email: admin.email, name: admin.name },
    data: { adminName: admin.name, resetUrl },
  })

  return NextResponse.json({ ok: true })
}
