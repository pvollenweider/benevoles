import Link from "next/link"
import { redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { formatShortDate } from "@/lib/utils"
import DuplicateButton from "@/components/admin/DuplicateButton"
import StatusBadge from "@/components/admin/StatusBadge"

export const dynamic = "force-dynamic"

export default async function AdminEventsPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const events = await db.event.findMany({
    include: {
      shifts: {
        where: { status: { not: "cancelled" } },
        include: { registrations: { where: { status: "active" } } },
      },
    },
    orderBy: { startDate: "desc" },
  })

  const enriched = events.map((event) => {
    const totalCapacity = event.shifts.reduce((s, sh) => s + sh.capacity, 0)
    const totalRegistered = event.shifts.reduce((s, sh) => s + sh.registrations.length, 0)
    return { ...event, totalCapacity, totalRegistered, spotsLeft: totalCapacity - totalRegistered }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Événements</h1>
        <Link
          href="/admin/events/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Nouvel événement
        </Link>
      </div>

      {enriched.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>Aucun événement. Créez-en un pour commencer.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {enriched.map((event) => (
            <div key={event.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/admin/events/${event.id}`}
                      className="font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                    >
                      {event.title}
                    </Link>
                    <StatusBadge status={event.publicStatus} />
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {formatShortDate(event.startDate)}
                    {event.location && ` · ${event.location}`}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span>{event.shifts.length} créneau{event.shifts.length > 1 ? "x" : ""}</span>
                    <span>{event.totalRegistered}/{event.totalCapacity} inscrits</span>
                    {event.spotsLeft > 0 && (
                      <span className="text-orange-600 font-medium">{event.spotsLeft} manquant{event.spotsLeft > 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <DuplicateButton eventId={event.id} />
                  <Link
                    href={`/admin/events/${event.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Gérer →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
