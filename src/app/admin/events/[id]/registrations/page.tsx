import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import RegistrationsManager from "@/components/admin/RegistrationsManager"
import { leaderKeySet, isSectorLeader } from "@/lib/sector-leaders"
import { SEARCH_MAX_LENGTH } from "@/lib/admin-search"
import { orgTimeZone } from "@/lib/time-zone"
import { answersByVolunteer } from "@/lib/event-questions"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { registrationsSummary } from "@/lib/registrations-list"

export const dynamic = "force-dynamic"

export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ shift?: string; q?: string | string[]; demandes?: string }>
}) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params
  const { shift: initialShiftFilter, q, demandes } = await searchParams
  const initialSearch = (Array.isArray(q) ? q[0] : q)?.slice(0, SEARCH_MAX_LENGTH).trim() || undefined

  const event = await db.event.findFirst({
    where: { id },
    include: {
      shifts: {
        where: { status: { not: "cancelled" } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      },
      registrations: {
        where: { status: { in: [...LIVE_STATUSES] } },
        include: { volunteer: true, shift: true },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      },
      sectorLeaders: true,
      organization: { select: { timeZone: true } },
      // Answers to the custom questions (#483), shown on each registration row.
      questions: { orderBy: [{ archivedAt: "asc" }, { position: "asc" }], select: { label: true, archivedAt: true, answers: { select: { volunteerId: true, values: true } } } },
    },
  })

  if (!event) notFound()

  // Count active registrations per shift from the already-loaded list
  const regCountByShift = event.registrations.reduce<Record<string, number>>((acc, r) => {
    acc[r.shift.id] = (acc[r.shift.id] ?? 0) + 1
    return acc
  }, {})

  // Flags a row as "Responsable" of its own shift's role, so the registrations list can show
  // who's already a sector leader without a second round trip from the client.
  const leaderKeys = leaderKeySet(event.sectorLeaders)

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/events/${id}`} className="text-sm text-blue-600">← {event.title}</Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900 mt-1">Inscriptions</h1>
          <a
            href={`/api/admin/events/${id}/export/attendance`}
            className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Exporter les présences (CSV)
          </a>
        </div>
        <p className="text-sm text-gray-500">
          {registrationsSummary({
            active: event.registrations.filter(r => r.status === "active").length,
            waiting: event.registrations.filter(r => r.status === "waiting" || r.status === "offered").length,
            requested: event.registrations.filter(r => r.status === "requested").length,
          })}
        </p>
      </div>

      <RegistrationsManager
        eventId={id}
        timeZone={orgTimeZone(event.organization)}
        answersByVolunteer={answersByVolunteer(event.questions)}
        initialShiftFilter={initialShiftFilter}
        initialSearch={initialSearch}
        initialRequestsOnly={demandes === "1"}
        initialRegistrations={event.registrations.map((r) => ({
          id: r.id,
          status: r.status,
          source: r.source,
          comment: r.comment,
          phone: r.phone,
          createdAt: r.createdAt.toISOString(),
          waitingPosition: r.waitingPosition,
          checkedInAt: r.checkedInAt?.toISOString() ?? null,
          volunteer: r.volunteer,
          isLeader: isSectorLeader(leaderKeys, r.shift.roleName, r.volunteer.email),
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
