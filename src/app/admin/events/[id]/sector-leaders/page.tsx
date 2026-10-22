import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import SectorLeadersManager from "@/components/admin/SectorLeadersManager"
import HelpLink from "@/components/admin/HelpLink"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { SECTOR_LEADER_ADMIN_SELECT } from "@/lib/admin-row-selects"
import { livePosteNames } from "@/lib/leader-postes"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Responsables de secteur" }

export default async function SectorLeadersPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params

  const event = await db.event.findFirst({ where: { id }, select: { id: true, title: true } })
  if (!event) notFound()

  const [leaders, shifts, registrations] = await Promise.all([
    db.sectorLeader.findMany({
      where: { eventId: id },
      // Props reach the browser: never the link token's hash or encrypted copy (#1009).
      select: SECTOR_LEADER_ADMIN_SELECT,
      orderBy: [{ roleName: "asc" }, { createdAt: "asc" }],
    }),
    db.shift.findMany({ where: { eventId: id }, select: { roleName: true, status: true }, distinct: ["roleName", "status"] }),
    db.registration.findMany({
      where: { eventId: id, status: { in: [...LIVE_STATUSES] } },
      select: { volunteer: { select: { id: true, firstName: true, lastName: true, email: true } }, shift: { select: { roleName: true } } },
    }),
  ])

  // The postes with a live shift (#1010): the add form suggests them, and a group of leaders whose
  // poste isn't one of them (deleted, every shift cancelled) is shown as such.
  const roleNames = livePosteNames(shifts)

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
        <h1 id="page-heading" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Responsables de secteur</h1>
        <HelpLink route="/admin/events/[id]/sector-leaders" />
        <p className="text-sm text-gray-500">
          Un ou plusieurs bénévoles responsables d&apos;un poste : ils reçoivent un lien personnel pour voir qui est inscrit (nom, email, téléphone), sans accès admin au reste de l&apos;événement.
        </p>
      </div>

      <SectorLeadersManager eventId={id} initialLeaders={leaders} roleNames={roleNames} registeredVolunteers={registeredVolunteers} />
    </div>
  )
}
