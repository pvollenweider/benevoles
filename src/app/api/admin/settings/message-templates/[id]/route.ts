// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { adminActor, logOrgEvent } from "@/lib/org-log"
import { templateSchema } from "@/lib/message-template"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard
  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const parsed = templateSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })

  // The scoped client makes a template of another organisation look like a missing one.
  const existing = await db.messageTemplate.findFirst({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: "Modèle introuvable" }, { status: 404 })

  // A client from before the category column (#1414) does not send one: keep the stored category
  // instead of resetting it to « Autres ».
  const data = body && typeof body === "object" && "category" in body ? parsed.data : { ...parsed.data, category: undefined }
  const template = await db.messageTemplate.update({
    where: { id },
    data,
    select: { id: true, name: true, category: true, subject: true, body: true, updatedAt: true },
  })
  await logOrgEvent({ organizationId, actor: adminActor(guard.session), action: "template.updated", entityType: "MessageTemplate", entityId: id })
  return NextResponse.json(template)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard
  const { id } = await params

  const existing = await db.messageTemplate.findFirst({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: "Modèle introuvable" }, { status: 404 })
  await db.messageTemplate.delete({ where: { id } })
  await logOrgEvent({ organizationId, actor: adminActor(guard.session), action: "template.deleted", entityType: "MessageTemplate", entityId: id })
  return NextResponse.json({ ok: true })
}
