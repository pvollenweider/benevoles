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
        <h1 className="text-2xl font-bold text-gray-900">Événements</h1>
        <Link
          href="/admin/events/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Nouvel événement
        </Link>
      </div>

      {enriched.length === 0 ? (
        <div className="text-center py-20 px-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 mb-5">
            <svg aria-hidden="true" className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Aucun événement pour l'instant</h2>
          <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6">
            Créez votre premier événement pour commencer à gérer les créneaux et les bénévoles.
          </p>
          <Link
            href="/admin/events/new"
            className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full hover:bg-blue-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
          >
            Créer un événement
          </Link>
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
