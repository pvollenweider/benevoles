// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { publicEventInclude, toPublicEvent } from "@/lib/public-event"
import { render } from "@/lib/notifications/templates"
import { pickShiftInfo } from "@/lib/shift-info"

/**
 * Preview of an event as a volunteer (#370), whatever its status (draft included): the same data
 * as GET /api/public/[eventSlug], read with the organization-scoped client. Nothing here creates
 * a registration or sends anything.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params

  const event = await guard.db.event.findFirst({ where: { id }, include: publicEventInclude })
  if (!event) return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 })

  return NextResponse.json({ ...toPublicEvent(event), publicStatus: event.publicStatus })
}

const previewSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).default(""),
  shiftIds: z.array(z.string()).min(1).max(50),
})

/**
 * The confirmation email a volunteer would receive for these shifts, rendered with the real
 * template but never sent. The management link points to a placeholder, not a real token.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params

  const parsed = previewSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error)
  const { firstName, lastName, shiftIds } = parsed.data

  const event = await guard.db.event.findFirst({ where: { id }, include: publicEventInclude })
  if (!event) return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 })

  const selected = event.shifts.filter((s) => shiftIds.includes(s.id))
  if (selected.length === 0) return NextResponse.json({ error: "Aucun créneau de cet événement sélectionné." }, { status: 400 })
  // Shifts already full would put the volunteer on the waitlist rather than confirm them.
  const waitlisted = selected.filter((s) => s.registrations.length >= s.capacity).map((s) => s.id)

  const volunteerName = `${firstName} ${lastName}`.trim()
  const email = render({
    kind: "registration_confirmation",
    recipient: { email: "apercu@exemple.ch", name: volunteerName },
    data: {
      volunteerName,
      eventTitle: event.title,
      shifts: selected
        .filter((s) => !waitlisted.includes(s.id))
        .map((s) => ({
          label: s.label,
          roleName: s.roleName,
          date: s.date.toLocaleDateString("fr-FR"),
          startTime: s.startTime,
          endTime: s.endTime,
          ...pickShiftInfo(s),
        })),
      editToken: "apercu",
      orgSlug: event.organization.slug,
      confirmationMessage: event.confirmationMessage ?? undefined,
    },
  })

  return NextResponse.json({
    subject: email.subject,
    html: email.html,
    confirmationMessage: event.confirmationMessage,
    waitlistedShiftIds: waitlisted,
  })
}
