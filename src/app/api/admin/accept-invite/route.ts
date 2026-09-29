// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
// Pre-login route: no org session yet, the invite token is the only credential.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { orgBaseUrl } from "@/lib/urls"
import { passwordSchema } from "@/lib/password"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { hashToken } from "@/lib/token-hash"
import { reportError } from "@/lib/report-error"
import { enqueueAndDeliver } from "@/lib/notifications/outbox"
import { validationError } from "@/lib/api-error"

const schema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
})

const INVALID_ERROR = "Lien invalide ou déjà utilisé."
const EXPIRED_ERROR = "Ce lien a expiré. Contactez votre administrateur."

/** Looks up an invite token and returns its status, without consuming it. */
async function checkToken(token: string) {
  const admin = await prisma.adminUser.findUnique({
    where: { setupTokenHash: hashToken(token) },
    select: {
      id: true,
      name: true,
      email: true,
      setupTokenExpiresAt: true,
      isActive: true,
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

  const result = await checkToken(token)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { admin } = result

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      passwordHash,
      isActive: true,
      setupTokenHash: null,
      setupTokenExpiresAt: null,
    },
  })

  if (admin.organization) {
    const adminUrl = `${orgBaseUrl(admin.organization.slug)}/admin/events`
    await enqueueAndDeliver([{
      kind: "admin_welcome",
      dedupeKey: `admin_welcome:${admin.id}`,
      recipient: { email: admin.email, name: admin.name },
      data: {
        adminName: admin.name,
        organizationName: admin.organization.name,
        adminUrl,
      },
    }]).catch(reportError("notification.admin_welcome"))
  }

  return NextResponse.json({ ok: true })
}
