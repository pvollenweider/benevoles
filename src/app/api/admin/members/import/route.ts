// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { rateLimit } from "@/lib/rate-limit"
import { analyseImport } from "@/lib/member-import-server"
import { parseOnDuplicate } from "@/lib/member-import-plan"
import { adminActor, logOrgEvent } from "@/lib/org-log"

/**
 * Applies a member import the admin has previewed (#464). The same file must come back (same
 * SHA-256) and plan the same writes; otherwise nothing is written and the new preview is returned.
 */
export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const form = await req.formData()
  const fileHash = form.get("fileHash")
  const planHash = form.get("planHash")
  if (typeof fileHash !== "string" || typeof planHash !== "string" || !fileHash || !planHash) {
    return NextResponse.json({ error: "Analysez le fichier avant de l'importer." }, { status: 400 })
  }

  const rl = await rateLimit(`org:${organizationId}`, "member-import", 10, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop d'imports cette heure-ci. Réessayez plus tard." }, { status: 429 })

  const onDuplicate = parseOnDuplicate(form.get("onDuplicate"))
  const result = await analyseImport(form.get("file"), db, organizationId, onDuplicate)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  const { analysis } = result

  if (analysis.fileHash !== fileHash) {
    return NextResponse.json({ error: "Ce n'est pas le fichier analysé. Analysez-le à nouveau avant d'importer." }, { status: 409 })
  }
  if (analysis.planHash !== planHash) {
    return NextResponse.json(
      { error: "Les membres ont changé depuis l'analyse. Voici l'analyse à jour : vérifiez-la puis confirmez.", preview: analysis },
      { status: 409 },
    )
  }

  let created = 0
  let updated = 0
  const errors = [...analysis.plan.errors]
  for (const line of analysis.plan.lines) {
    try {
      if (line.action === "update" && line.existingId) {
        await db.volunteer.update({
          where: { id: line.existingId },
          data: { firstName: line.firstName, lastName: line.lastName, phone: line.phone, tags: line.tags, active: true },
        })
        updated++
      } else if (line.action === "create") {
        await db.volunteer.create({
          data: { organizationId, firstName: line.firstName, lastName: line.lastName, email: line.email, phone: line.phone, tags: line.tags },
        })
        created++
      }
    } catch (err) {
      // Only the error code: the message can quote the member's email.
      console.error("Member import row error:", (err as { code?: string })?.code ?? "unknown")
      errors.push({ line: line.line, reason: line.action === "create" ? "Création impossible (membre créé entre-temps ?)" : "Mise à jour impossible" })
    }
  }
  errors.sort((a, b) => a.line - b.line)
  const skipped = analysis.plan.counts.skip

  await logOrgEvent({
    organizationId,
    actor: adminActor(guard.session),
    action: "member.imported",
    entityType: "Member",
    entityId: "import",
    changes: { created: { from: null, to: created }, updated: { from: null, to: updated }, skipped: { from: null, to: skipped }, errors: { from: null, to: errors.length } },
  })

  return NextResponse.json({ created, updated, skipped, errors, detectedColumns: analysis.detectedColumns, totalParsed: analysis.totalParsed })
}
