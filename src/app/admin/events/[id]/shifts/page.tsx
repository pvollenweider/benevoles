import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import ShiftsManager from "@/components/admin/ShiftsManager"

export const dynamic = "force-dynamic"

export default async function ShiftsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    include: {
      shifts: {
        include: { registrations: { where: { status: "active" } } },
        orderBy: [{ date: "asc" }, { displayOrder: "asc" }, { startTime: "asc" }],
      },
    },
  })

  if (!event) notFound()

  type Show = { name: string; date: string; startTime: string; endTime: string }
  const showSchedule = (event.showSchedule as Show[]) ?? []

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/events/${id}`} className="text-sm text-blue-600">← {event.title}</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Créneaux</h1>
      </div>
      <ShiftsManager
        eventId={id}
        eventStartDate={event.startDate.toISOString().split("T")[0]}
        eventEndDate={event.endDate.toISOString().split("T")[0]}
        showSchedule={showSchedule}
        initialShifts={event.shifts.map(s => ({
          ...s,
          date: s.date.toISOString().split("T")[0],
          registrationCount: s.registrations.length,
        }))}
      />
    </div>
  )
}
