import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor } from "@/lib/event-log"
import { addSectorLeader, cancelRegistrations, resendManagementLinks } from "@/lib/admin-registration-actions"
import { z } from "zod"
import { registrationToken } from "@/lib/token-vault"

// Bulk actions on the registrations list (#292): one request for the whole selection instead
// of one per row. All-or-nothing on ownership: every id must be a registration of this event,
// in this organization, or nothing is done.
const schema = z.object({
  action: z.enum(["cancel", "make_leader", "resend_link"]),
  registrationIds: z.array(z.string().min(1)).min(1).max(500),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const { id: eventId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

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
      const cancelledIds = await cancelRegistrations(db, actor, regs.filter((r) => r.status === "active"))
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
    case "resend_link": {
      const active = regs.filter((r) => r.status === "active")
      const result = await resendManagementLinks(active.map((r) => ({ editToken: registrationToken.reveal(r), volunteer: r.volunteer, event })))
      return NextResponse.json({ done: result.sent, failed: result.failed, skipped: result.skipped + (regs.length - active.length) })
    }
  }
}
