import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { logEvent, SYSTEM_ACTOR, type LogChanges } from "@/lib/event-log"

/**
 * For an event whose shifts/registrations predate this feature (or any that somehow slipped
 * through without being logged), writes one "*.baseline" entry per entity capturing its current
 * state — never a real history: there is nothing to reconstruct prior modifications from (see
 * issue #187 discussion). Each entry's `changes` uses { from: null, to: <current value> }, the
 * same shape as a "created" entry, but a distinct action name so the UI and narrative mode never
 * present it as "this was created now".
 *
 * Idempotent: an entity that already has any log entry (baseline or real) is skipped, so this
 * can be re-run safely and never overwrites real history with a synthetic one.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params

  const event = await db.event.findFirst({
    where: { id: eventId },
    include: {
      shifts: true,
      registrations: true,
      memberInvites: true,
    },
  })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const existingEntityIds = new Set(
    (
      await prisma.eventLog.findMany({
        where: { eventId },
        select: { entityId: true },
        distinct: ["entityId"],
      })
    ).map((r) => r.entityId),
  )

  let created = 0

  if (!existingEntityIds.has(event.id)) {
    await logEvent({
      eventId,
      actor: SYSTEM_ACTOR,
      action: "event.baseline",
      entityType: "Event",
      entityId: event.id,
      changes: toBaselineChanges({
        title: event.title,
        publicStatus: event.publicStatus,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
      }),
      createdAt: event.createdAt,
    })
    created++
  }

  for (const shift of event.shifts) {
    if (existingEntityIds.has(shift.id)) continue
    await logEvent({
      eventId,
      actor: SYSTEM_ACTOR,
      action: "shift.baseline",
      entityType: "Shift",
      entityId: shift.id,
      changes: toBaselineChanges({
        roleName: shift.roleName,
        label: shift.label,
        date: shift.date.toISOString(),
        startTime: shift.startTime,
        endTime: shift.endTime,
        capacity: shift.capacity,
        status: shift.status,
      }),
      createdAt: shift.createdAt,
    })
    created++
  }

  for (const registration of event.registrations) {
    if (existingEntityIds.has(registration.id)) continue
    await logEvent({
      eventId,
      actor: SYSTEM_ACTOR,
      action: "registration.baseline",
      entityType: "Registration",
      entityId: registration.id,
      changes: toBaselineChanges({
        shiftId: registration.shiftId,
        status: registration.status,
        source: registration.source,
      }),
      createdAt: registration.createdAt,
    })
    created++
  }

  for (const invite of event.memberInvites) {
    if (existingEntityIds.has(invite.id)) continue
    await logEvent({
      eventId,
      actor: SYSTEM_ACTOR,
      action: "memberinvite.baseline",
      entityType: "MemberInvite",
      entityId: invite.id,
      createdAt: invite.sentAt,
    })
    created++
  }

  return NextResponse.json({ created })
}

function toBaselineChanges(fields: Record<string, unknown>): LogChanges {
  const changes: LogChanges = {}
  for (const [field, value] of Object.entries(fields)) {
    changes[field] = { from: null, to: value }
  }
  return changes
}
