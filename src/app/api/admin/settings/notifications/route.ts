// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor } from "@/lib/org-log"
import { Prisma } from "@/generated/prisma/client"
import { validationError } from "@/lib/api-error"
import { mergeNotificationSettings, notificationSettingsPatchSchema, parseNotificationSettings } from "@/lib/notification-settings"
// The Organization row isn't a tenant-scoped model: read and written by its own id, from the session.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"

/** Notification settings of the organization (#381). */
export async function GET() {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const org = await prisma.organization.findUnique({ where: { id: guard.organizationId }, select: { replyToEmail: true, notificationSettings: true } })
  return NextResponse.json({ replyToEmail: org?.replyToEmail ?? null, settings: parseNotificationSettings(org?.notificationSettings) })
}

/** Partial update: only the switches or the address sent change; logged in the organization's activity. */
export async function PATCH(req: Request) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { organizationId, session } = guard

  const parsed = notificationSettingsPatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })

  // Read, write and log under the organization's row lock, in one transaction: an owner's
  // activation (accept-invite, #1077) fills a missing reply-to under the same lock and skips an
  // organization whose reply-to was changed here, so a clear saved at the same moment always wins.
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`
    const current = await tx.organization.findUnique({ where: { id: organizationId }, select: { replyToEmail: true, notificationSettings: true } })
    const before = parseNotificationSettings(current?.notificationSettings)
    const settings = mergeNotificationSettings(before, parsed.data.settings)
    const replyToEmail = parsed.data.replyToEmail === undefined ? (current?.replyToEmail ?? null) : parsed.data.replyToEmail || null

    const row = await tx.organization.update({
      where: { id: organizationId },
      data: { notificationSettings: settings, replyToEmail },
      select: { replyToEmail: true, notificationSettings: true },
    })

    const changes: Record<string, { from: unknown; to: unknown }> = {}
    if ((current?.replyToEmail ?? null) !== replyToEmail) changes.replyToEmail = { from: current?.replyToEmail ?? null, to: replyToEmail }
    if (JSON.stringify(before) !== JSON.stringify(settings)) changes.settings = { from: before, to: settings }
    if (Object.keys(changes).length > 0) {
      const actor = adminActor(session)
      await tx.orgLog.create({
        data: {
          organizationId,
          actorType: actor.type,
          actorId: ("id" in actor ? actor.id : undefined) ?? null,
          action: "organization.notifications_updated",
          entityType: "Organization",
          entityId: organizationId,
          changes: changes as Prisma.InputJsonValue,
        },
      })
    }
    return row
  })
  return NextResponse.json({ replyToEmail: updated.replyToEmail, settings: parseNotificationSettings(updated.notificationSettings) })
}
