// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { adminActor, logOrgEvent } from "@/lib/org-log"
import { TEMPLATE_LIMIT, templateSchema } from "@/lib/message-template"

/** The organisation's message templates (#482), by name. */
export async function GET() {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const templates = await guard.db.messageTemplate.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, subject: true, body: true, updatedAt: true },
  })
  return NextResponse.json(templates)
}

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const parsed = templateSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })

  if ((await db.messageTemplate.count()) >= TEMPLATE_LIMIT) {
    return NextResponse.json({ error: `${TEMPLATE_LIMIT} modèles au plus : supprimez-en un avant d'en créer un autre.` }, { status: 409 })
  }
  const template = await db.messageTemplate.create({
    data: { organizationId, ...parsed.data },
    select: { id: true, name: true, subject: true, body: true, updatedAt: true },
  })
  await logOrgEvent({ organizationId, actor: adminActor(guard.session), action: "template.created", entityType: "MessageTemplate", entityId: template.id })
  return NextResponse.json(template, { status: 201 })
}
