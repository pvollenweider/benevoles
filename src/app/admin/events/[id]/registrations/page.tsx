import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import RegistrationsManager from "@/components/admin/RegistrationsManager"

export const dynamic = "force-dynamic"

export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ shift?: string }>
}) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params
  const { shift: initialShiftFilter } = await searchParams

  const event = await db.event.findFirst({
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

  // Count active registrations per shift from the already-loaded list
  const regCountByShift = event.registrations.reduce<Record<string, number>>((acc, r) => {
    acc[r.shift.id] = (acc[r.shift.id] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/events/${id}`} className="text-sm text-blue-600">← {event.title}</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Inscriptions</h1>
        <p className="text-sm text-gray-500">{event.registrations.length} inscription(s) active(s)</p>
      </div>

      <RegistrationsManager
        eventId={id}
        initialShiftFilter={initialShiftFilter}
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
            capacity: r.shift.capacity,
            registrationCount: regCountByShift[r.shift.id] ?? 0,
          },
        }))}
        shifts={event.shifts.map((s) => ({
          id: s.id,
          roleName: s.roleName,
          label: s.label,
          date: s.date.toISOString().split("T")[0],
          startTime: s.startTime,
          endTime: s.endTime,
          capacity: s.capacity,
          registrationCount: regCountByShift[s.id] ?? 0,
        }))}
      />
    </div>
  )
}
