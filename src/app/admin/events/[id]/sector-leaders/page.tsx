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

  const [leaders, shifts] = await Promise.all([
    prisma.sectorLeader.findMany({
      where: { eventId: id },
      orderBy: [{ roleName: "asc" }, { createdAt: "asc" }],
    }),
    prisma.shift.findMany({ where: { eventId: id }, select: { roleName: true }, distinct: ["roleName"] }),
  ])

  const roleNames = [...new Set(shifts.map((s) => s.roleName))].sort((a, b) => a.localeCompare(b))

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/events/${id}`} className="text-sm text-blue-600">← {event.title}</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Responsables de secteur</h1>
        <p className="text-sm text-gray-500">
          Un ou plusieurs bénévoles responsables d&apos;un poste : ils reçoivent un lien personnel pour voir qui est inscrit (nom, email, téléphone), sans accès admin au reste de l&apos;événement.
        </p>
      </div>

      <SectorLeadersManager eventId={id} initialLeaders={leaders} roleNames={roleNames} />
    </div>
  )
}
