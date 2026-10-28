// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { previewWorkloadPolicy } from "@/lib/workload-policy-data"

/**
 * « Aperçu avant activation » of the workload protection (#1171): the proposed values judged on
 * the commitments held now, with the service-day examples. Saves nothing, protects nothing.
 */
const schema = z.object({ values: z.record(z.string(), z.unknown()) }).strict()

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Indiquez les valeurs à essayer." }, { status: 400 })
  const result = await previewWorkloadPolicy(guard.db, id, parsed.data.values)
  if (!result.ok) return NextResponse.json({ error: result.error, ...(result.problems ? { problems: result.problems } : {}) }, { status: result.status })
  return NextResponse.json(result)
}
