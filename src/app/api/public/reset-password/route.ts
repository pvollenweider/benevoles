import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { passwordErrors } from "@/lib/password"

export async function POST(req: Request) {
  const { token, password } = await req.json().catch(() => ({}))

  if (typeof token !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 })
  }

  const errors = passwordErrors(password)
  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0] }, { status: 400 })
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
