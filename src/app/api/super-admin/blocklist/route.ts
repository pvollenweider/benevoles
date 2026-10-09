// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { validateBlock } from "@/lib/signup-blocklist"

/** Block list of the self-service sign-up (#810, part 5): super admin only. */
export async function GET() {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const blocks = await prisma.signupBlock.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, label: true, reason: true, expiresAt: true, createdAt: true },
  })
  return NextResponse.json(blocks)
}

export async function POST(req: Request) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const body = await req.json().catch(() => ({}))
  const result = validateBlock(body ?? {}, process.env.AUTH_SECRET ?? "")
  if (!result.ok) return NextResponse.json({ error: result.error, field: result.field, needsConfirmation: result.needsConfirmation ?? false }, { status: 400 })

  const { kind, value, label, reason, expiresAt } = result.block
  // Same value again: the reason and the expiry are refreshed, never two rows for one value.
  const block = await prisma.signupBlock.upsert({
    where: { kind_value: { kind, value } },
    create: { kind, value, label, reason, expiresAt, createdById: guard.session.user?.id ?? null },
    update: { reason, expiresAt, label },
    select: { id: true, kind: true, label: true, reason: true, expiresAt: true, createdAt: true },
  })
  return NextResponse.json(block, { status: 201 })
}
