import { redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { formatShortDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const now = new Date()

  const [events, volunteers, volunteersResult] = await Promise.all([
    db.event.findMany({
      include: {
        shifts: {
          where: { status: { not: "cancelled" } },
          include: { registrations: { where: { status: "active" } } },
        },
      },
      orderBy: { startDate: "desc" },
    }),
    db.volunteer.findMany({ select: { id: true, email: true, active: true } }),
    db.registration.findMany({
      where: { status: "active" },
      select: { volunteerId: true },
      distinct: ["volunteerId"],
    }),
  ])

  const totalEvents = events.length
  const publishedEvents = events.filter((e) => e.publicStatus === "published").length
  const upcomingEvents = events.filter(
    (e) => e.publicStatus === "published" && e.endDate >= now
  ).length

  const totalCapacity = events.reduce(
    (sum, e) => sum + e.shifts.reduce((s, sh) => s + sh.capacity, 0),
    0
  )
  const totalRegistered = events.reduce(
    (sum, e) => sum + e.shifts.reduce((s, sh) => s + sh.registrations.length, 0),
    0
  )
  const fillRate = totalCapacity > 0 ? Math.round((totalRegistered / totalCapacity) * 100) : 0

  const totalMembers = volunteers.length
  const membersWithEmail = volunteers.filter((v) => v.email).length
  const membersWithoutEmail = totalMembers - membersWithEmail
  const totalVolunteers = volunteersResult.length

  // Events with at least 1 shift, capped at 10 for display (already sorted desc by startDate)
  const eventsWithShifts = events
    .filter((e) => e.shifts.length > 0)
    .slice(0, 10)

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-gray-900">Tableau de bord</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BigStatCard label="Événements" value={totalEvents} sub={`${publishedEvents} publié${publishedEvents !== 1 ? "s" : ""} · ${upcomingEvents} à venir`} />
        <BigStatCard label="Bénévoles inscrits" value={totalRegistered} sub={`${totalVolunteers} bénévole${totalVolunteers !== 1 ? "s" : ""} unique${totalVolunteers !== 1 ? "s" : ""}`} />
        <BigStatCard label="Taux de remplissage" value={`${fillRate} %`} sub={`${totalRegistered}/${totalCapacity} places`} />
        <BigStatCard label="Membres" value={totalMembers} sub={`${membersWithEmail} avec email`} />
      </div>

      {/* Fill rate per event */}
      {eventsWithShifts.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Remplissage par événement
          </h2>
          <div className="space-y-2">
            {eventsWithShifts.map((event) => {
              const cap = event.shifts.reduce((s, sh) => s + sh.capacity, 0)
              const reg = event.shifts.reduce((s, sh) => s + sh.registrations.length, 0)
              const pct = cap > 0 ? Math.round((reg / cap) * 100) : 0
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
                <div key={event.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatShortDate(event.startDate)}</p>
                    </div>
                    <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ${countColor}`}>
                      {reg}/{cap} inscrits
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${Math.max(pct, reg > 0 ? 3 : 0)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Members */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Membres
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{totalMembers}</p>
            <p className="text-xs text-gray-500 mt-1">Total</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{membersWithEmail}</p>
            <p className="text-xs text-gray-500 mt-1">Avec email</p>
          </div>
          <div className={`rounded-xl border p-4 text-center ${membersWithoutEmail > 0 ? "bg-orange-50 border-orange-200" : "bg-white border-gray-200"}`}>
            <p className={`text-2xl font-bold ${membersWithoutEmail > 0 ? "text-orange-700" : "text-gray-900"}`}>{membersWithoutEmail}</p>
            <p className="text-xs text-gray-500 mt-1">Sans email (ne peuvent pas recevoir d&apos;invitations)</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function BigStatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-sm font-medium text-gray-700 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}
