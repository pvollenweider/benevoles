// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { validationError } from "@/lib/api-error"

const schema = z.object({ version: z.string().min(1) })

/** Dismisses the "new release" banner for this super admin, for one version (#612). */
export async function PATCH(req: Request) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const { session } = guard

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)

  await prisma.adminUser.update({
    where: { id: session.user.id },
    data: { releaseBannerDismissedVersion: parsed.data.version },
  })

  return NextResponse.json({ ok: true })
}
