import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import { formatShortDate } from "@/lib/utils"
import { eventPublicUrl } from "@/lib/urls"
import StatusBadge from "@/components/admin/StatusBadge"
import PublishToggle from "@/components/admin/PublishToggle"
import SendReminderButton from "@/components/admin/SendReminderButton"

export const dynamic = "force-dynamic"

export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    include: {
      organization: { select: { slug: true } },
      shifts: {
        where: { status: { not: "cancelled" } },
        include: {
          registrations: {
            where: { status: { in: ["active", "waiting", "offered"] } },
            select: { id: true, status: true, volunteerId: true },
          },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      },
    },
  })

  if (!event) notFound()

  const totalCapacity = event.shifts.reduce((s, sh) => s + sh.capacity, 0)
  const totalRegistered = event.shifts.reduce(
    (s, sh) => s + sh.registrations.filter((r) => r.status === "active").length,
    0
  )
  const criticalShifts = event.shifts.filter(
    (sh) => sh.capacity - sh.registrations.filter((r) => r.status === "active").length >= 2
  )

  // Unique volunteers across all shifts (one reminder email per person)
  const uniqueVolunteerIds = new Set<string>()
  for (const sh of event.shifts)
    for (const r of sh.registrations)
      if (r.status === "active") uniqueVolunteerIds.add(r.volunteerId)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/admin/events" className="text-sm text-blue-600">← Événements</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{event.title}</h1>
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
            className="text-sm border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors"
          >
            Modifier
          </Link>
          {event.publicStatus === "published" && (
            <Link
              href={eventPublicUrl(event.organization.slug, event.slug)}
              target="_blank"
              className="text-sm text-blue-600 border border-blue-200 px-3 py-1.5 rounded-full hover:bg-blue-50 transition-colors"
            >
              Vue publique ↗
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Créneaux" value={event.shifts.length} />
        <StatCard label="Places" value={totalCapacity} />
        <StatCard label="Inscrits" value={totalRegistered} />
        <StatCard label="Restants" value={totalCapacity - totalRegistered} highlight={totalCapacity - totalRegistered === 0 || (totalCapacity > 0 && (totalCapacity - totalRegistered) / totalCapacity <= 0.15)} />
      </div>

      {/* Primary actions */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href={`/admin/events/${event.id}/shifts`}
          className="bg-blue-600 text-white rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors flex-1 text-center"
        >
          Gérer les créneaux
        </Link>
        <Link
          href={`/admin/events/${event.id}/registrations`}
          className="bg-blue-600 text-white rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors flex-1 text-center"
        >
          Voir les inscriptions
        </Link>
        <Link
          href={`/admin/events/${event.id}/invitations`}
          className="border border-gray-300 text-gray-700 rounded-full px-5 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors flex-1 text-center"
        >
          Inviter des membres
        </Link>
      </div>
      {/* Utility actions */}
      <div className="flex gap-4 flex-wrap">
        <Link href={`/admin/events/${event.id}/qr`} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
          QR code
        </Link>
        <a href={`/api/admin/events/${event.id}/export/pdf`} target="_blank" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
          Exporter PDF ↗
        </a>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Communications</h2>
        <SendReminderButton
          eventId={event.id}
          hasMessage={!!event.reminderMessage?.trim()}
          volunteerCount={uniqueVolunteerIds.size}
          lastSentAt={event.reminderSentAt?.toISOString() ?? null}
        />
      </div>

      {criticalShifts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Créneaux à pourvoir ({criticalShifts.length})
          </h2>
          <div className="space-y-2">
            {criticalShifts.map((shift) => {
              const filled = shift.registrations.filter((r) => r.status === "active").length
              const waitingCount = shift.registrations.filter((r) => r.status === "waiting" || r.status === "offered").length
              const { capacity } = shift
              const pct = capacity > 0 ? Math.round((filled / capacity) * 100) : 0
              const barColor =
                pct >= 75 ? "bg-green-500" :
                pct >= 50 ? "bg-yellow-400" :
                pct >= 25 ? "bg-orange-400" :
                "bg-red-400"
              const countColor =
                pct >= 75 ? "text-green-700" :
                pct >= 50 ? "text-yellow-700" :
                pct >= 25 ? "text-orange-600" :
                "text-red-600"
              return (
                <div key={shift.id} className="bg-white border border-gray-200 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <p className="text-sm font-medium text-gray-800">
                      {shift.label !== shift.roleName
                        ? <>{shift.roleName} <span className="font-normal text-gray-400">·</span> {shift.label}</>
                        : shift.label}
                    </p>
                    <p className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                      {shift.date.toLocaleDateString("fr-FR")} · {shift.startTime}–{shift.endTime}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${Math.max(pct, filled > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ${countColor}`}>
                      {filled}/{capacity} bénévole{capacity > 1 ? "s" : ""}
                    </span>
                    {waitingCount > 0 && (
                      <span className="text-xs text-gray-400">
                        {waitingCount} en attente
                      </span>
                    )}
                  </div>
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
