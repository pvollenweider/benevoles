import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const { token, password } = await req.json().catch(() => ({}))

  if (typeof token !== "string" || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 })
  }

  const admin = await prisma.adminUser.findUnique({ where: { passwordResetToken: token } })

  if (!admin || !admin.passwordResetExpiresAt || admin.passwordResetExpiresAt < new Date()) {
    return NextResponse.json({ error: "Lien invalide ou expiré." }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    },
  })

  return NextResponse.json({ ok: true })
}
