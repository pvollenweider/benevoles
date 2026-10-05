import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import ShiftsManager from "@/components/admin/ShiftsManager"
import WizardSteps from "@/components/admin/WizardSteps"
import HelpLink from "@/components/admin/HelpLink"

export const dynamic = "force-dynamic"

export default async function ShiftsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ wizard?: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params
  const { wizard } = await searchParams

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

  const shiftCount = event.shifts.filter((s) => s.status !== "cancelled").length

  return (
    <div className="space-y-6">
      {wizard && <WizardSteps current={2} eventId={id} />}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href={`/admin/events/${id}`} className="text-sm text-blue-600">← {event.title}</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Créneaux</h1>
          <HelpLink route="/admin/events/[id]/shifts" />
        </div>
        {wizard && (
          <div className="text-right">
            <Link
              href={`/admin/events/${id}/review`}
              className="inline-block bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Continuer : vérification et publication
            </Link>
            {shiftCount === 0 && <p className="text-sm text-gray-700 mt-1">Aucun créneau pour l&apos;instant : la publication attendra.</p>}
          </div>
        )}
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
