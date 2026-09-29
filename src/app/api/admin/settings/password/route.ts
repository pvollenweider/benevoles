// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { PASSWORD_CHECK_BLOCKED, passwordCheckAllowed, recordPasswordCheckFailure } from "@/lib/admin-session"
import { getClientIp } from "@/lib/rate-limit"
// AdminUser (the signed-in admin's own row, by session id) isn't a tenant-scoped model.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"
import { passwordErrors } from "@/lib/password"
import bcrypt from "bcryptjs"
import { z } from "zod"

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
})

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 })
  }

  const { currentPassword, newPassword } = parsed.data

  const errors = passwordErrors(newPassword)
  if (errors.length > 0) {
    return NextResponse.json({ error: `Le nouveau mot de passe ne respecte pas les règles : ${errors.join(", ").toLowerCase()}.`, details: { errors } }, { status: 400 })
  }

  const adminId = guard.session.user.id
  if (!adminId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 })

  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { passwordHash: true },
  })
  if (!admin) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 })

  // Failed checks are limited per account and IP (#358), before bcrypt runs.
  const ip = getClientIp(req)
  if (!(await passwordCheckAllowed(ip, adminId))) {
    return NextResponse.json({ error: PASSWORD_CHECK_BLOCKED }, { status: 429 })
  }
  const valid = await bcrypt.compare(currentPassword, admin.passwordHash)
  if (!valid) {
    await recordPasswordCheckFailure(ip, adminId)
    return NextResponse.json({ error: "Le mot de passe actuel est incorrect." }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.adminUser.update({
    where: { id: adminId },
    // Ends every session opened before (#360); the form signs this one in again right after.
    data: { passwordHash, sessionVersion: { increment: 1 } },
  })

  return NextResponse.json({ ok: true })
}
