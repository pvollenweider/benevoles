/**
 * Writes to OrgLog — see issue #194 and prisma/schema.prisma's doc comment on the model. Mirrors
 * event-log.ts's write side exactly (never throws, same minimal-PII discipline on `changes`), for
 * organization-level entities (Member/AdminUser) that don't belong to a single event. Reuses
 * event-log.ts's actor primitives (LogActor, adminActor, SYSTEM_ACTOR, diffFields) since those are
 * already generic, not event-specific.
 */
import { prisma } from "./prisma"
import { Prisma } from "@/generated/prisma/client"
import type { LogActor } from "./event-log"

export type { LogActor }
export { adminActor, SYSTEM_ACTOR, diffFields } from "./event-log"

export type OrgLogEntityType = "Member" | "AdminUser"

interface LogOrgEventParams {
  organizationId: string
  actor: LogActor
  action: string
  entityType: OrgLogEntityType
  entityId: string
  changes?: Record<string, { from: unknown; to: unknown }>
}

export async function logOrgEvent(params: LogOrgEventParams): Promise<string | null> {
  const { organizationId, actor, action, entityType, entityId, changes } = params
  try {
    const entry = await prisma.orgLog.create({
      data: {
        organizationId,
        actorType: actor.type,
        actorId: ("id" in actor ? actor.id : undefined) ?? null,
        action,
        entityType,
        entityId,
        changes: (changes ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      select: { id: true },
    })
    return entry.id
  } catch (err) {
    console.error("logOrgEvent failed", { organizationId, action, entityType, entityId }, err)
    return null
  }
}
