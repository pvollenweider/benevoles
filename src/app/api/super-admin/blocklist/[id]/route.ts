// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { logOperator } from "@/lib/operator-log"

/** Removes one entry of the sign-up block list (#810, part 5). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const removed = await prisma.$transaction(async (tx) => {
    const block = await tx.signupBlock.findUnique({ where: { id }, select: { id: true, label: true } })
    if (!block) return null
    await tx.signupBlock.delete({ where: { id } })
    await logOperator(tx, { action: "blocklist.removed", actor: guard.session.user, entityType: "SignupBlock", entityId: id, target: block.label })
    return block
  })
  if (!removed) return NextResponse.json({ error: "Entrée introuvable." }, { status: 404 })
  return NextResponse.json({ ok: true })
}
