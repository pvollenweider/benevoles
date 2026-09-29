// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { passwordErrors } from "@/lib/password"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { hashToken } from "@/lib/token-hash"

export async function POST(req: Request) {
  const rl = await rateLimit(getClientIp(req), "reset-password", 10, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 })
  }

  const { token, password } = await req.json().catch(() => ({}))

  if (typeof token !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 })
  }

  const errors = passwordErrors(password)
  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0] }, { status: 400 })
  }

  const admin = await prisma.adminUser.findUnique({ where: { passwordResetTokenHash: hashToken(token) } })

  if (!admin || !admin.passwordResetExpiresAt || admin.passwordResetExpiresAt < new Date()) {
    return NextResponse.json({ error: "Lien invalide ou expiré." }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      passwordHash,
      // Signs out every session opened before the reset (#360), e.g. one opened by whoever
      // made the reset necessary.
      sessionVersion: { increment: 1 },
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    },
  })

  return NextResponse.json({ ok: true })
}
