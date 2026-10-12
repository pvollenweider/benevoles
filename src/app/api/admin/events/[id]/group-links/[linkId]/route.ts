// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent, type LogChanges } from "@/lib/event-log"
import { eventPublicUrl } from "@/lib/urls"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { checkRoles, groupLinkLogValues, groupLinkPatch, liveRoleNames, nameTaken, toAdminGroupLink } from "@/lib/group-links-data"
import { GROUP_LINK_NAME_TAKEN, groupLinkStats } from "@/lib/group-links"

// One share link per group (#947): rename it, change its roles or option, delete it. The code (and
// so the URL and the printed QR codes) never changes. Deleting keeps the registrations it brought;
// their reference is cleared by the foreign key (ON DELETE SET NULL).

const eventSelect = { id: true, slug: true, organization: { select: { slug: true } } } as const

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id, linkId } = await params
  const parsed = groupLinkPatch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] === "name" ? "name" : "roleNames"
    return NextResponse.json({ error: field === "name" ? issue.message : "Données invalides.", field }, { status: 400 })
  }

  const event = await db.event.findFirst({ where: { id }, select: eventSelect })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  const before = await db.eventGroupLink.findFirst({ where: { id: linkId, eventId: id } })
  if (!before) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  if (parsed.data.name !== undefined && await nameTaken(db, id, parsed.data.name, linkId)) {
    return NextResponse.json({ error: GROUP_LINK_NAME_TAKEN, field: "name" }, { status: 409 })
  }

  const live = await liveRoleNames(db, id)
  let roleNames: string[] | undefined
  if (parsed.data.roleNames !== undefined) {
    const roles = checkRoles(parsed.data.roleNames, live)
    if (!roles.ok) return NextResponse.json({ error: roles.error, field: "roleNames" }, { status: 400 })
    roleNames = roles.roleNames
  }

  const after = await db.eventGroupLink.update({
    where: { id: linkId },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(roleNames !== undefined ? { roleNames } : {}),
      ...(parsed.data.hideFull !== undefined ? { hideFull: parsed.data.hideFull } : {}),
    },
  })

  const from = groupLinkLogValues(before)
  const to = groupLinkLogValues(after)
  const changes: LogChanges = {}
  for (const key of Object.keys(to) as (keyof typeof to)[]) {
    if (from[key] !== to[key]) changes[key] = { from: from[key], to: to[key] }
  }
  if (Object.keys(changes).length > 0) {
    await logEvent({ eventId: id, actor: adminActor(guard.session), action: "grouplink.updated", entityType: "GroupLink", entityId: linkId, changes })
  }

  const regs = await db.registration.findMany({
    where: { eventId: id, groupLinkId: linkId, status: { in: [...LIVE_STATUSES] } },
    select: { groupLinkId: true, volunteerId: true },
  })
  return NextResponse.json(toAdminGroupLink(after, eventPublicUrl(event.organization.slug, event.slug), live, groupLinkStats(regs).get(linkId)))
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id, linkId } = await params
  const event = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  const link = await db.eventGroupLink.findFirst({ where: { id: linkId, eventId: id } })
  if (!link) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await db.eventGroupLink.delete({ where: { id: linkId } })

  await logEvent({
    eventId: id,
    actor: adminActor(guard.session),
    action: "grouplink.deleted",
    entityType: "GroupLink",
    entityId: linkId,
    changes: { name: { from: link.name, to: null } },
  })

  return NextResponse.json({ success: true })
}
