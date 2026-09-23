/**
 * Writes to EventLog. Never throws: a logging failure must not break the mutation it documents,
 * so every call here swallows its own errors (logged to the console, nothing more).
 *
 * No display name is stored here (no `actorLabel` field): it would duplicate the admin's or
 * volunteer's name into a place that outlives their own record — exactly what the minimal-PII
 * rule below already rules out for the subject of an action. `actorId` is resolved to a display
 * name at read time (see event-log-read.ts), falling back to a generic label per `actorType`
 * when the join misses (removed admin, RGPD-purged volunteer).
 *
 * `changes` stays free of the subject's PII on purpose (no volunteer name/email/phone) — see
 * docs/roles-et-permissions.md and issue #187. It records which fields changed and their
 * non-PII values, referencing the entity by id.
 */
import { prisma } from "./prisma"
import { Prisma } from "@/generated/prisma/client"

export type LogActor =
  | { type: "admin"; id: string }
  | { type: "volunteer"; id?: string }
  | { type: "system" }

/** Automated actions with no human actor: waitlist promotion, reminder emails, expiry sweeps. */
export const SYSTEM_ACTOR: LogActor = { type: "system" }

/** Builds the admin actor from an authenticated session, for routes guarded by requireOrgSession(). */
export function adminActor(session: { user?: { id?: string } }): LogActor {
  return { type: "admin", id: session.user?.id ?? "" }
}

export type LogChanges = Record<string, { from: unknown; to: unknown }>

export type LogEntityType = "Shift" | "Registration" | "Event" | "MemberInvite" | "EventPage"

interface LogEventParams {
  eventId: string
  actor: LogActor
  action: string
  entityType: LogEntityType
  entityId: string
  changes?: LogChanges
  /** id of the EventLog entry this one is a direct, known consequence of. Never inferred. */
  causedByLogId?: string
  /**
   * Overrides the entry's timestamp (defaults to now). Used by the baseline endpoint: a
   * synthetic "state observed" entry should carry the entity's own real creation date, not
   * the moment someone happened to click "Générer l'état initial" — that moment isn't when
   * anything meaningful happened, and placing every baseline entry at "now" would misrepresent
   * a timeline. Still real data (the entity's actual createdAt), never fabricated.
   */
  createdAt?: Date
}

/**
 * Logs one action. Returns the new entry's id (usable as `causedByLogId` for a follow-up call
 * in the same request, e.g. a cancellation that triggers a waitlist offer) or null if logging
 * failed — callers should not treat a null return as fatal.
 */
export async function logEvent(params: LogEventParams): Promise<string | null> {
  const { eventId, actor, action, entityType, entityId, changes, causedByLogId, createdAt } = params
  try {
    const entry = await prisma.eventLog.create({
      data: {
        eventId,
        actorType: actor.type,
        actorId: ("id" in actor ? actor.id : undefined) ?? null,
        action,
        entityType,
        entityId,
        changes: (changes ?? undefined) as Prisma.InputJsonValue | undefined,
        causedByLogId: causedByLogId ?? null,
        ...(createdAt ? { createdAt } : {}),
      },
      select: { id: true },
    })
    return entry.id
  } catch (err) {
    console.error("logEvent failed", { eventId, action, entityType, entityId }, err)
    return null
  }
}

/**
 * Computes a minimal { field: { from, to } } diff between two plain objects, keeping only the
 * fields listed in `fields` and only those that actually changed. Use for entity updates so the
 * log records real changes, not a full before/after snapshot.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: (keyof T)[],
): LogChanges | undefined {
  const changes: LogChanges = {}
  for (const field of fields) {
    const from = before[field]
    const to = after[field]
    if (from === to) continue
    if (from instanceof Date && to instanceof Date && from.getTime() === to.getTime()) continue
    changes[field as string] = { from: from instanceof Date ? from.toISOString() : from, to: to instanceof Date ? to.toISOString() : to }
  }
  return Object.keys(changes).length > 0 ? changes : undefined
}
