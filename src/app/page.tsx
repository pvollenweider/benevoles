import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { formatShortDate } from "@/lib/utils"
import PublicFooter from "@/components/PublicFooter"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const events = await prisma.event.findMany({
    where: { publicStatus: "published" },
    include: {
      organization: { select: { slug: true } },
      shifts: {
        where: { status: { not: "cancelled" } },
        include: { registrations: { where: { status: "active" } } },
      },
    },
    orderBy: { startDate: "asc" },
  })

  const enriched = events.map((event) => {
    const totalCapacity = event.shifts.reduce((s, sh) => s + sh.capacity, 0)
    const totalRegistered = event.shifts.reduce((s, sh) => s + sh.registrations.length, 0)
    return { ...event, totalCapacity, totalRegistered, spotsLeft: totalCapacity - totalRegistered }
  })

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">Bénévoles</h1>
          <p className="text-gray-500 text-sm mt-1">Inscrivez-vous pour aider lors de nos spectacles</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {enriched.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Aucun événement en cours.</p>
            <p className="text-sm mt-2">Revenez bientôt !</p>
          </div>
        ) : (
          <div className="space-y-4">
            {enriched.map((event) => (
              <Link
                key={event.id}
                href={`/${event.organization.slug}/${event.slug}`}
                className="block bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <h2 className="text-lg font-semibold text-gray-900">{event.title}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {formatShortDate(event.startDate)}
                  {event.endDate.toDateString() !== event.startDate.toDateString() &&
                    ` — ${formatShortDate(event.endDate)}`}
                </p>
                {event.location && (
                  <p className="text-sm text-gray-400 mt-1">📍 {event.location}</p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {event.spotsLeft > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700">
                        {event.spotsLeft} place{event.spotsLeft > 1 ? "s" : ""} à pourvoir
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                        Complet
                      </span>
                    )}
                  </div>
                  <span className="text-blue-600 text-sm font-medium">Voir les créneaux →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <PublicFooter />
    </main>
  )
}
