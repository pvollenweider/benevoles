import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { sendMemberInvite } from "@/lib/email"
import { z } from "zod"

const schema = z.object({
  email: z.string().email(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Email invalide." }, { status: 400 })

  const event = await db.event.findFirst({
    where: { id: eventId },
    include: { organization: { select: { name: true, slug: true } } },
  })
  if (!event) return NextResponse.json({ error: "Événement introuvable." }, { status: 404 })

  await sendMemberInvite({
    to: parsed.data.email,
    memberName: "Prénom Nom",
    organizationName: event.organization.name,
    eventTitle: event.title,
    eventDate: event.startDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
    eventLocation: event.location,
    orgSlug: event.organization.slug,
    eventSlug: event.slug,
    message: "[Ceci est un email de test — les liens sont fictifs]",
    token: "test-token-preview",
  })

  return NextResponse.json({ ok: true })
}
