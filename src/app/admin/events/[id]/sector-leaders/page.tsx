import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import SectorLeadersManager from "@/components/admin/SectorLeadersManager"

export const dynamic = "force-dynamic"

export default async function SectorLeadersPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params

  const event = await db.event.findFirst({ where: { id }, select: { id: true, title: true } })
  if (!event) notFound()

  const [leaders, shifts, registrations] = await Promise.all([
    prisma.sectorLeader.findMany({
      where: { eventId: id },
      orderBy: [{ roleName: "asc" }, { createdAt: "asc" }],
    }),
    prisma.shift.findMany({ where: { eventId: id }, select: { roleName: true }, distinct: ["roleName"] }),
    prisma.registration.findMany({
      where: { eventId: id, status: { in: ["active", "waiting", "offered"] } },
      select: { volunteer: { select: { id: true, firstName: true, lastName: true, email: true } }, shift: { select: { roleName: true } } },
    }),
  ])

  const roleNames = [...new Set(shifts.map((s) => s.roleName))].sort((a, b) => a.localeCompare(b))

  // One entry per registered volunteer, with the distinct roles they're signed up for — feeds
  // the "pick from an already-registered volunteer" shortcut instead of typing name/email by hand.
  const byVolunteer = new Map<string, { id: string; name: string; email: string; roleNames: string[] }>()
  for (const r of registrations) {
    if (!r.volunteer.email) continue // SectorLeader.email is required — skip volunteers without one
    let entry = byVolunteer.get(r.volunteer.id)
    if (!entry) {
      entry = { id: r.volunteer.id, name: `${r.volunteer.firstName} ${r.volunteer.lastName}`, email: r.volunteer.email, roleNames: [] }
      byVolunteer.set(r.volunteer.id, entry)
    }
    if (!entry.roleNames.includes(r.shift.roleName)) entry.roleNames.push(r.shift.roleName)
  }
  const registeredVolunteers = [...byVolunteer.values()].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/events/${id}`} className="text-sm text-blue-600">← {event.title}</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Responsables de secteur</h1>
        <p className="text-sm text-gray-500">
          Un ou plusieurs bénévoles responsables d&apos;un poste : ils reçoivent un lien personnel pour voir qui est inscrit (nom, email, téléphone), sans accès admin au reste de l&apos;événement.
        </p>
      </div>

      <SectorLeadersManager eventId={id} initialLeaders={leaders} roleNames={roleNames} registeredVolunteers={registeredVolunteers} />
    </div>
  )
}
