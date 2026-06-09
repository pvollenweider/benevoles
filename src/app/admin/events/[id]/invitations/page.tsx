import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import InvitationsManager from "@/components/admin/InvitationsManager"

export const dynamic = "force-dynamic"

export default async function EventInvitationsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db, organizationId } = ctx

  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    select: { id: true, title: true, slug: true, startDate: true },
  })
  if (!event) notFound()

  const [invites, volunteers] = await Promise.all([
    db.memberInvite.findMany({
      where: { eventId: id },
      include: {
        volunteer: { select: { id: true, firstName: true, lastName: true, email: true, tags: true, active: true } },
      },
      orderBy: { sentAt: "desc" },
    }),
    db.volunteer.findMany({
      where: { active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ])

  const volunteerEmails = invites
    .map((i) => i.volunteer.email)
    .filter((e): e is string => !!e)

  const registrations = volunteerEmails.length
    ? await prisma.registration.findMany({
        where: {
          eventId: id,
          status: "active",
          volunteer: { email: { in: volunteerEmails } },
          // Defense in depth: ensure the registration belongs to this org
          // even if someone bypasses the helper's where injection.
          event: { organizationId },
        },
        select: { volunteer: { select: { email: true } } },
      })
    : []
  const registeredEmails = new Set(registrations.map((r) => r.volunteer.email).filter((e): e is string => !!e))

  const allTags = new Set<string>()
  for (const v of volunteers) for (const t of v.tags) allTags.add(t)

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/admin/events/${id}`} className="text-sm text-blue-600">← {event.title}</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Invitations</h1>
      </div>

      <InvitationsManager
        eventId={id}
        members={volunteers.map((v) => ({
          id: v.id,
          firstName: v.firstName,
          lastName: v.lastName,
          email: v.email,
          tags: v.tags,
        }))}
        allTags={Array.from(allTags).sort()}
        invites={invites.map((i) => ({
          id: i.id,
          sentAt: i.sentAt.toISOString(),
          usedAt: i.usedAt?.toISOString() ?? null,
          volunteerId: i.volunteer.id,
          firstName: i.volunteer.firstName,
          lastName: i.volunteer.lastName,
          email: i.volunteer.email,
          tags: i.volunteer.tags,
          registered: i.volunteer.email ? registeredEmails.has(i.volunteer.email) : false,
        }))}
      />
    </div>
  )
}
