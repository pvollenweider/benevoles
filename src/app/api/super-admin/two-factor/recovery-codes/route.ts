// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { beginSecondFactorAttempt, regenerateRecoveryCodes } from "@/lib/second-factor-server"
import { SECOND_FACTOR_MESSAGES } from "@/lib/second-factor-copy"
import { getClientIp } from "@/lib/rate-limit"

/**
 * New recovery codes for the signed-in super admin (pentest F6), with a current code of the app:
 * the old ones stop working, the new ones are answered once (never stored in clear, never cached).
 */

const schema = z.object({ code: z.string().max(20) }).strict()

export async function POST(req: Request) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const id = guard.session.user.id
  if (!id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: SECOND_FACTOR_MESSAGES.invalidCode }, { status: 400 })

  const account = await prisma.adminUser.findUnique({ where: { id }, select: { id: true, email: true, role: true, sessionVersion: true, isActive: true } })
  if (!account) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const attempt = await beginSecondFactorAttempt(account.id, getClientIp(req))
  if (!attempt.allowed) return NextResponse.json({ error: SECOND_FACTOR_MESSAGES.tooManyAttempts }, { status: 429 })

  const outcome = await regenerateRecoveryCodes(account, parsed.data.code, Date.now())
  if (!outcome.ok) {
    const error = outcome.reason === "not_enrolled" ? "La double authentification n'est pas activée sur ce compte." : SECOND_FACTOR_MESSAGES.invalidCode
    return NextResponse.json({ error }, { status: 400, headers: { "Cache-Control": "no-store" } })
  }
  await attempt.succeeded()
  return NextResponse.json({ ok: true, recoveryCodes: outcome.recoveryCodes }, { headers: { "Cache-Control": "no-store" } })
}
