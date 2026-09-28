import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { sendNotification } from "@/lib/notifications"
import { registrationToken } from "@/lib/token-vault"

// Lets an admin resend a volunteer their own personal management link (/my/[token]) — e.g. when
// they accidentally deleted the confirmation email that carried it. Any of a volunteer's active
// registrations for the event carries an editToken that, once visited, resolves the volunteer
// and lists every active registration they have for that event — so resending any one of them is
// enough to fully restore access, not just to the specific shift this row happens to be.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const owned = await db.registration.findFirst({ where: { id }, select: { id: true, status: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  if (owned.status !== "active") {
    return NextResponse.json({ error: "Cette inscription n'est plus active." }, { status: 409 })
  }

  const registration = await db.registration.findUniqueOrThrow({
    where: { id },
    include: {
      volunteer: { select: { firstName: true, lastName: true, email: true } },
      event: { select: { title: true, organization: { select: { slug: true } } } },
    },
  })

  if (!registration.volunteer.email) {
    return NextResponse.json({ error: "Aucun email enregistré pour ce bénévole." }, { status: 400 })
  }

  const result = await sendNotification({
    kind: "registration_link_resend",
    recipient: { email: registration.volunteer.email, name: `${registration.volunteer.firstName} ${registration.volunteer.lastName}` },
    data: {
      volunteerName: `${registration.volunteer.firstName} ${registration.volunteer.lastName}`,
      eventTitle: registration.event.title,
      orgSlug: registration.event.organization.slug,
      editToken: registrationToken.reveal(registration),
    },
  })

  if (!result.ok) return NextResponse.json({ error: "Échec de l'envoi de l'email." }, { status: 502 })

  return NextResponse.json({ success: true })
}
