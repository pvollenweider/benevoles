import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import RegistrationsManager from "@/components/admin/RegistrationsManager"

export const dynamic = "force-dynamic"

export default async function RegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      shifts: {
        where: { status: { not: "cancelled" } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      },
      registrations: {
        where: { status: "active" },
        include: { volunteer: true, shift: true },
        orderBy: { createdAt: "desc" },
      },
    },
  })

  if (!event) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/events/${id}`} className="text-sm text-blue-600">← {event.title}</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Inscriptions</h1>
        <p className="text-sm text-gray-500">{event.registrations.length} inscription(s) active(s)</p>
      </div>

      <RegistrationsManager
        eventId={id}
        initialRegistrations={event.registrations.map((r) => ({
          id: r.id,
          status: r.status,
          source: r.source,
          comment: r.comment,
          createdAt: r.createdAt.toISOString(),
          volunteer: r.volunteer,
          shift: {
            id: r.shift.id,
            roleName: r.shift.roleName,
            label: r.shift.label,
            date: r.shift.date.toISOString().split("T")[0],
            startTime: r.shift.startTime,
            endTime: r.shift.endTime,
          },
        }))}
        shifts={event.shifts.map((s) => ({
          id: s.id,
          roleName: s.roleName,
          label: s.label,
          date: s.date.toISOString().split("T")[0],
          startTime: s.startTime,
          endTime: s.endTime,
        }))}
      />
    </div>
  )
}
