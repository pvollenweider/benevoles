// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"

/** Removes one entry of the sign-up block list (#810, part 5). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const { count } = await prisma.signupBlock.deleteMany({ where: { id } })
  if (count === 0) return NextResponse.json({ error: "Entrée introuvable." }, { status: 404 })
  return NextResponse.json({ ok: true })
}
