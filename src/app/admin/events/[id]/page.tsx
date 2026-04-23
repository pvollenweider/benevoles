import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { formatShortDate } from "@/lib/utils"
import StatusBadge from "@/components/admin/StatusBadge"
import PublishToggle from "@/components/admin/PublishToggle"

export const dynamic = "force-dynamic"

export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      shifts: {
        where: { status: { not: "cancelled" } },
        include: { registrations: { where: { status: "active" } } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      },
    },
  })

  if (!event) notFound()

  const totalCapacity = event.shifts.reduce((s, sh) => s + sh.capacity, 0)
  const totalRegistered = event.shifts.reduce((s, sh) => s + sh.registrations.length, 0)
  const criticalShifts = event.shifts.filter((sh) => sh.capacity - sh.registrations.length >= 2)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/admin/events" className="text-sm text-blue-600">← Événements</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{event.title}</h1>
          <p className="text-sm text-gray-500">
            {formatShortDate(event.startDate)}
            {event.location && ` · ${event.location}`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge status={event.publicStatus} />
          <PublishToggle eventId={event.id} currentStatus={event.publicStatus} />
          <Link
            href={`/admin/events/${event.id}/edit`}
            className="text-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Modifier
          </Link>
          <Link
            href={`/events/${event.slug}`}
            target="_blank"
            className="text-sm text-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            Vue publique ↗
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Créneaux" value={event.shifts.length} />
        <StatCard label="Places" value={totalCapacity} />
        <StatCard label="Inscrits" value={totalRegistered} />
        <StatCard label="Restants" value={totalCapacity - totalRegistered} highlight={totalCapacity - totalRegistered > 0} />
      </div>

      <div className="flex gap-3 flex-wrap">
        <Link
          href={`/admin/events/${event.id}/shifts`}
          className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex-1 text-center"
        >
          Gérer les créneaux
        </Link>
        <Link
          href={`/admin/events/${event.id}/registrations`}
          className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex-1 text-center"
        >
          Voir les inscriptions
        </Link>
        <a
          href={`/api/admin/events/${event.id}/export`}
          className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex-1 text-center"
        >
          Exporter CSV
        </a>
      </div>

      {criticalShifts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Créneaux à pourvoir ({criticalShifts.length})
          </h2>
          <div className="space-y-2">
            {criticalShifts.map((shift) => {
              const missing = shift.capacity - shift.registrations.length
              return (
                <div key={shift.id} className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{shift.label}</p>
                    <p className="text-xs text-gray-500">{shift.date.toLocaleDateString("fr-FR")} · {shift.startTime}–{shift.endTime}</p>
                  </div>
                  <span className="text-sm font-semibold text-orange-700">{missing} manquant{missing > 1 ? "s" : ""}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 text-center ${highlight ? "bg-orange-50 border-orange-200" : "bg-white border-gray-200"}`}>
      <p className={`text-2xl font-bold ${highlight ? "text-orange-700" : "text-gray-900"}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}
