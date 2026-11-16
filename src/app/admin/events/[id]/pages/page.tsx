import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import EventPagesManager from "@/components/admin/EventPagesManager"
import HelpLink from "@/components/admin/HelpLink"
import { eventPostes } from "@/lib/poste-suggestions"
import { roleSectorOf } from "@/lib/role-settings"
import { sectorsAdopted } from "@/lib/sectors"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Pages d'information" }

export default async function EventPagesPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    select: {
      id: true,
      title: true,
      sectorsEnabled: true,
      sectorsAdoptedAt: true,
      pages: {
        select: { id: true, slug: true, title: true, content: true, displayOrder: true, roleNames: true },
        orderBy: { displayOrder: "asc" },
      },
      // The poste checkboxes of the form (#1324): the live shifts give each poste its sector.
      shifts: {
        where: { status: { not: "cancelled" } },
        select: { roleName: true, displayOrder: true, sectorId: true, updatedAt: true },
      },
      sectors: { where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { displayOrder: "asc" } },
    },
  })
  if (!event) notFound()

  const adopted = sectorsAdopted(event)
  const sectorName = new Map(event.sectors.map((s) => [s.id, s.name]))
  const postes = eventPostes(event.shifts).map((name) => {
    const own = event.shifts.filter((s) => s.roleName === name)
    const sectorId = roleSectorOf(own)
    return { name, sector: adopted && sectorId ? sectorName.get(sectorId) ?? null : null }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Pages d&apos;information</h1>
        <HelpLink route="/admin/events/[id]/pages" />
        <p className="text-sm text-gray-500">Règlement, FAQ, infos pratiques — du contenu libre en plus des instructions publiques, visible sur la page d&apos;inscription.</p>
      </div>

      <EventPagesManager eventId={id} initialPages={event.pages} postes={postes} sectorsAdopted={adopted} />
    </div>
  )
}
