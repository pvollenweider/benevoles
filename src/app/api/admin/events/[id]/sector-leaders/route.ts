import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor } from "@/lib/event-log"
import { addSectorLeader } from "@/lib/admin-registration-actions"
import { z } from "zod"

const postSchema = z.object({
  roleName: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  email: z.string().email(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const leaders = await db.sectorLeader.findMany({
    where: { eventId },
    orderBy: [{ roleName: "asc" }, { createdAt: "asc" }],
  })
  return NextResponse.json(leaders)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const body = await req.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const event = await db.event.findFirst({
    where: { id: eventId },
    select: { title: true, organization: { select: { slug: true } } },
  })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // Same path as the bulk "Rendre responsable" on the registrations list (#292).
  const result = await addSectorLeader(
    db,
    { organizationId: guard.organizationId, actor: adminActor(guard.session), event: { id: eventId, ...event } },
    parsed.data,
  )
  if (result.status === "exists") return NextResponse.json({ error: "Cette personne est déjà responsable de ce poste" }, { status: 409 })

  return NextResponse.json(result.leader, { status: 201 })
}
