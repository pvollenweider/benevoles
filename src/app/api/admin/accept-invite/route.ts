// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
// Pre-login route: no org session yet, the invite token is the only credential.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { passwordSchema } from "@/lib/password"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { hashToken } from "@/lib/token-hash"
import { deliverAfterResponse } from "@/lib/notifications/outbox"
import { validationError } from "@/lib/api-error"
import { activateAccount } from "@/lib/account-activation-server"
import { activationAllowed } from "@/lib/activation-budget"

const schema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
})

const INVALID_ERROR = "Lien invalide ou déjà utilisé."
const EXPIRED_ERROR = "Ce lien a expiré. Contactez le propriétaire de votre espace."

/** Looks up an invite token and returns its status, without consuming it. */
async function checkToken(token: string) {
  const admin = await prisma.adminUser.findUnique({
    where: { setupTokenHash: hashToken(token) },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      setupTokenExpiresAt: true,
      isActive: true,
      organizationId: true,
      organization: { select: { name: true, slug: true } },
    },
  })

  if (!admin) return { ok: false as const, status: 404, error: INVALID_ERROR }
  if (admin.setupTokenExpiresAt && admin.setupTokenExpiresAt < new Date()) {
    return { ok: false as const, status: 410, error: EXPIRED_ERROR }
  }
  return { ok: true as const, admin }
}

/** Read-only precheck so the page can show an error before the person fills the form. */
export async function GET(req: Request) {
  const rl = await rateLimit(getClientIp(req), "accept-invite-check", 30, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 })
  }

  const token = new URL(req.url).searchParams.get("token") ?? ""
  if (!token) return NextResponse.json({ valid: false, error: INVALID_ERROR }, { status: 404 })

  const result = await checkToken(token)
  if (!result.ok) return NextResponse.json({ valid: false, error: result.error }, { status: result.status })
  return NextResponse.json({ valid: true })
}

export async function POST(req: Request) {
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error)
  }

  const { token, password } = parsed.data

  // Counted before the token lookup and bcrypt, so parallel requests can't all get through.
  if (!(await activationAllowed(getClientIp(req), token))) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 })
  }

  const result = await checkToken(token)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { admin } = result

  const passwordHash = await bcrypt.hash(password, 12)

  // Activation and welcome email commit together (#352). The transactional part lives in
  // src/lib/account-activation-server.ts, also called by the concurrency integration test; its
  // lock order (the account's AdminUser row first, then the Organisation row) is documented there.
  const organization = admin.organization
  const outboxIds = await prisma.$transaction((tx) => activateAccount(tx, {
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      organizationId: admin.organizationId,
    },
    organization,
    token,
    passwordHash,
  }))
  if (outboxIds === null) {
    // Lost to another consumption, a replacement or the expiry: same answer as a fresh lookup.
    const now = await checkToken(token)
    return now.ok
      ? NextResponse.json({ error: INVALID_ERROR }, { status: 404 })
      : NextResponse.json({ error: now.error }, { status: now.status })
  }
  deliverAfterResponse(outboxIds)

  return NextResponse.json({ ok: true })
}
