// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireFrontDeskOrOrganizer } from "@/lib/auth-guard"
import { isFrontDeskBulkAction } from "@/lib/permissions"
import { adminActor } from "@/lib/event-log"
import { addSectorLeader, cancelRegistrations, resendManagementLinks, setAttendance } from "@/lib/admin-registration-actions"
import { z } from "zod"
import { registrationToken } from "@/lib/token-vault"
import { validationError } from "@/lib/api-error"
import type { AttendanceTransition } from "@/lib/attendance-state"

// Bulk actions on the registrations list (#292): one request for the whole selection instead
// of one per row. All-or-nothing on ownership: every id must be a registration of this event,
// in this organization, or nothing is done. Attendance actions (#1141) are check_in,
// undo_check_in, mark_absent and undo_absent; "left_early" is reserved for a later PR and
// therefore refused here as an unknown action.
//
// A front-desk account holding a live grant on this event (#1142) may use the attendance actions
// only: any other action is refused with a 403 before the event or a registration is read. The
// guard reads the grant for the event of the path, and the ownership check below is on that same
// event, for every id, before any write.
const schema = z.object({
  action: z.enum(["cancel", "make_leader", "resend_link", "check_in", "undo_check_in", "mark_absent", "undo_absent"]),
  registrationIds: z.array(z.string().min(1)).min(1).max(500),
  // Attendance actions only (#1141), optional: registration id → the shift the page showed it
  // on. A registration that has moved to another shift since is not written and comes back as
  // unchanged with `moved: true`. Callers that send nothing keep the previous behaviour.
  observedShifts: z.record(z.string().min(1), z.string().min(1)).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params
  const guard = await requireFrontDeskOrOrganizer(eventId)
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  // Front desk: attendance only. Organisers and owners keep every action.
  if (guard.access !== "organizer" && !isFrontDeskBulkAction(parsed.data.action)) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  }

  const event = await db.event.findFirst({
    where: { id: eventId },
    select: { id: true, title: true, organization: { select: { slug: true } } },
  })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const ids = [...new Set(parsed.data.registrationIds)]
  const regs = await db.registration.findMany({
    where: { id: { in: ids }, eventId },
    include: {
      volunteer: { select: { id: true, firstName: true, lastName: true, email: true } },
      shift: { select: { roleName: true } },
    },
  })
  if (regs.length !== ids.length) return NextResponse.json({ error: "Inscription introuvable" }, { status: 404 })

  const actor = adminActor(guard.session)

  switch (parsed.data.action) {
    case "cancel": {
      const cancelledIds = await cancelRegistrations(db, actor, regs.filter((r) => r.status === "active" || r.status === "unconfirmed"))
      return NextResponse.json({ done: cancelledIds.length, cancelledIds, skipped: ids.length - cancelledIds.length })
    }
    case "make_leader": {
      // One leader per (role, email): two selected rows of the same person on the same role
      // make them leader once.
      const inputs = new Map<string, { roleName: string; name: string; email: string }>()
      let skipped = 0
      for (const r of regs) {
        if (!r.volunteer.email) { skipped++; continue }
        const key = `${r.shift.roleName}\u0000${r.volunteer.email}`
        if (!inputs.has(key)) {
          inputs.set(key, { roleName: r.shift.roleName, name: `${r.volunteer.firstName} ${r.volunteer.lastName}`, email: r.volunteer.email })
        }
      }
      let done = 0
      let alreadyLeader = 0
      for (const input of inputs.values()) {
        const result = await addSectorLeader(db, { organizationId, actor, event }, input)
        if (result.status === "created") done++; else alreadyLeader++
      }
      return NextResponse.json({ done, alreadyLeader, skipped })
    }
    case "check_in":
    case "undo_check_in":
    case "mark_absent":
    case "undo_absent": {
      const observed = parsed.data.observedShifts ?? {}
      const targets = regs.map((r) => ({ id: r.id, eventId: r.eventId, shiftId: r.shiftId, status: r.status, observedShiftId: Object.hasOwn(observed, r.id) ? observed[r.id] : null }))
      const results = await setAttendance(db, actor, targets, parsed.data.action as AttendanceTransition)
      const changedIds = results.filter((r) => r.changed).map((r) => r.id)
      // `done` and `changedIds` stay for existing callers; `results` gives the state of every
      // requested registration after the call, including the ones that changed nothing, with
      // `moved` (on another shift than the one acted on) or `gone` (no longer there) when so.
      return NextResponse.json({ done: changedIds.length, changedIds, skipped: ids.length - changedIds.length, results })
    }
    case "resend_link": {
      const active = regs.filter((r) => r.status === "active")
      const result = await resendManagementLinks(active.map((r) => ({ editToken: registrationToken.reveal(r), volunteer: r.volunteer, event, organizationId })))
      return NextResponse.json({ done: result.sent, failed: result.failed, skipped: result.skipped + (regs.length - active.length) })
    }
  }
}
