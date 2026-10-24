// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { passwordErrors } from "@/lib/password"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { hashToken } from "@/lib/token-hash"

const INVALID_ERROR = "Lien invalide ou expiré."

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

  const tokenHash = hashToken(token)
  const admin = await prisma.adminUser.findUnique({ where: { passwordResetTokenHash: tokenHash } })

  if (!admin || !admin.passwordResetExpiresAt || admin.passwordResetExpiresAt < new Date()) {
    return NextResponse.json({ error: INVALID_ERROR }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  // Consumes the link atomically: the update only matches while the account still carries this
  // token, unexpired. A concurrent request that consumed it first, a link replaced by a newer
  // request or one expired during bcrypt match no row, and the password stays as it was.
  const { count } = await prisma.adminUser.updateMany({
    where: { id: admin.id, passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { gt: new Date() } },
    data: {
      passwordHash,
      // Signs out every session opened before the reset (#360), e.g. one opened by whoever
      // made the reset necessary.
      sessionVersion: { increment: 1 },
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    },
  })
  if (count === 0) {
    return NextResponse.json({ error: INVALID_ERROR }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
