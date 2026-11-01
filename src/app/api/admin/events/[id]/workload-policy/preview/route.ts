// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { previewWorkloadPolicy, workloadProtectionOffered, WORKLOAD_NOT_OFFERED } from "@/lib/workload-policy-data"
import { rateLimit } from "@/lib/rate-limit"

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
  const event = await guard.db.event.findFirst({ where: { id }, select: { id: true, workloadProtectionEnabled: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  if (!(await workloadProtectionOffered(guard.organizationId, event))) return NextResponse.json({ error: WORKLOAD_NOT_OFFERED }, { status: 403 })
  // Each preview scans the event's commitments: bounded per organisation.
  const rl = await rateLimit(`org:${guard.organizationId}`, "workload-preview", 120, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop d'aperçus cette heure-ci. Réessayez plus tard." }, { status: 429 })
  const result = await previewWorkloadPolicy(guard.db, id, parsed.data.values)
  if (!result.ok) return NextResponse.json({ error: result.error, ...(result.problems ? { problems: result.problems } : {}) }, { status: result.status })
  return NextResponse.json(result)
}
