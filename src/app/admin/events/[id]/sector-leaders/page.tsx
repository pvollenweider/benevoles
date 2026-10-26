import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import SectorLeadersManager from "@/components/admin/SectorLeadersManager"
import HelpLink from "@/components/admin/HelpLink"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { SECTOR_LEADER_ADMIN_SELECT } from "@/lib/admin-row-selects"
import { deletedPosteNames, livePosteNames } from "@/lib/leader-postes"
import { canAdoptBeta } from "@/lib/beta-access"
import { posteSectorsOf, scopeRoleNames } from "@/lib/leader-scope"
import { activeSectors, sectorsAdopted } from "@/lib/sectors"

export const dynamic = "force-dynamic"
// The title follows the h1 (#1169): « Responsables de poste et de secteur » once the event adopted sectors.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const ctx = await getOrgContext()
  const { id } = await params
  const event = ctx ? await ctx.db.event.findFirst({ where: { id }, select: { sectorsEnabled: true, sectorsAdoptedAt: true } }) : null
  return { title: event && sectorsAdopted(event) ? "Responsables de poste et de secteur" : "Responsables de secteur" }
}

export default async function SectorLeadersPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    select: { id: true, title: true, sectorsEnabled: true, sectorsAdoptedAt: true, sectors: { select: { id: true, name: true, displayOrder: true, archivedAt: true } } },
  })
  if (!event) notFound()
  // Sector leaders (#1169): only in an event that adopted sectors; a new one also needs the beta
  // capability « sectorLeaders ». Without sectors the screen is the one of before #1169.
  const adopted = sectorsAdopted(event)

  const [leaders, shifts, registrations, liveShifts, canAddSectorLeader] = await Promise.all([
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
    adopted ? db.shift.findMany({ where: { eventId: id, status: { not: "cancelled" } }, select: { roleName: true, sectorId: true, updatedAt: true } }) : Promise.resolve([]),
    adopted ? canAdoptBeta(ctx.organizationId, "sectorLeaders") : Promise.resolve(false),
  ])

  // Each sector with the postes it covers now (the leaders' scope, src/lib/leader-scope.ts).
  const ctxSectors = posteSectorsOf(liveShifts, event.sectors)
  const sectors = adopted
    ? [...activeSectors(event.sectors), ...event.sectors.filter((s) => s.archivedAt)].map((s) => ({
      id: s.id, name: s.name, archived: !!s.archivedAt, postes: scopeRoleNames({ roleName: null, sectorId: s.id }, ctxSectors),
    }))
    : []

  // The add form suggests the postes with a live shift; a group of leaders of a deleted poste,
  // every shift cancelled, is shown as such (#1010).
  const roleNames = livePosteNames(shifts)
  const deletedPostes = deletedPosteNames(shifts)

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
        <h1 id="page-heading" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">{adopted ? "Responsables de poste et de secteur" : "Responsables de secteur"}</h1>
        <HelpLink route="/admin/events/[id]/sector-leaders" />
        <p className="text-sm text-gray-500">
          {adopted
            ? <>Un ou plusieurs bénévoles responsables d&apos;un poste, ou de tous les postes d&apos;un secteur : ils reçoivent un lien personnel pour voir qui est inscrit (nom, email, téléphone), sans accès admin au reste de l&apos;événement.</>
            : <>Un ou plusieurs bénévoles responsables d&apos;un poste : ils reçoivent un lien personnel pour voir qui est inscrit (nom, email, téléphone), sans accès admin au reste de l&apos;événement.</>}
        </p>
      </div>

      <SectorLeadersManager
        eventId={id} initialLeaders={leaders} roleNames={roleNames} deletedPostes={deletedPostes} registeredVolunteers={registeredVolunteers}
        sectors={adopted ? { list: sectors, canAdd: canAddSectorLeader } : undefined}
      />
    </div>
  )
}
