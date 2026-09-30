// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { rateLimit } from "@/lib/rate-limit"
import { analyseImport } from "@/lib/member-import-server"
import { parseOnDuplicate } from "@/lib/member-import-plan"

/** Analyses a member file without writing anything (#464). The import then needs its hashes. */
export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const rl = await rateLimit(`org:${organizationId}`, "member-import-preview", 30, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop d'analyses de fichiers cette heure-ci. Réessayez plus tard." }, { status: 429 })

  const form = await req.formData()
  const result = await analyseImport(form.get("file"), db, organizationId, parseOnDuplicate(form.get("onDuplicate")))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.analysis)
}
