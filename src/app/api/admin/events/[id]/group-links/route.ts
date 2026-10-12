// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { eventPublicUrl } from "@/lib/urls"
import { GROUP_LINK_NAME_TAKEN } from "@/lib/group-links"
import {
  checkRoles,
  createWithUniqueCode,
  groupLinkInput,
  groupLinkLogValues,
  liveRoleNames,
  loadAdminGroupLinks,
  nameTaken,
  toAdminGroupLink,
} from "@/lib/group-links-data"

// Share links per group (#947): list and create. An event's links are its organisation's business,
// like its pages or milestones: organiser level (src/lib/permissions.ts).

const eventSelect = { id: true, slug: true, organization: { select: { slug: true } } } as const

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params
  const event = await db.event.findFirst({ where: { id }, select: eventSelect })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  return NextResponse.json(await loadAdminGroupLinks(db, event))
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params
  const parsed = groupLinkInput.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0] === "name" ? "name" : "roleNames"
    return NextResponse.json({ error: field === "name" ? issue.message : "Données invalides.", field }, { status: 400 })
  }

  const event = await db.event.findFirst({ where: { id }, select: eventSelect })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  if (await nameTaken(db, id, parsed.data.name)) {
    return NextResponse.json({ error: GROUP_LINK_NAME_TAKEN, field: "name" }, { status: 409 })
  }

  const live = await liveRoleNames(db, id)
  const roles = checkRoles(parsed.data.roleNames, live)
  if (!roles.ok) return NextResponse.json({ error: roles.error, field: "roleNames" }, { status: 400 })

  const link = await createWithUniqueCode((code) =>
    db.eventGroupLink.create({
      data: { eventId: id, code, name: parsed.data.name, roleNames: roles.roleNames, hideFull: parsed.data.hideFull },
    }),
  )

  const values = groupLinkLogValues(link)
  await logEvent({
    eventId: id,
    actor: adminActor(guard.session),
    action: "grouplink.created",
    entityType: "GroupLink",
    entityId: link.id,
    changes: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { from: null, to: v }])),
  })

  return NextResponse.json(toAdminGroupLink(link, eventPublicUrl(event.organization.slug, event.slug), live), { status: 201 })
}
