import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import RegistrationsManager from "@/components/admin/RegistrationsManager"
import { leaderKeySet, isSectorLeader } from "@/lib/sector-leaders"
import { SEARCH_MAX_LENGTH } from "@/lib/admin-search"
import { orgTimeZone } from "@/lib/time-zone"
import { answersByVolunteer } from "@/lib/event-questions"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { registrationsSummary, charterAcceptanceLabel } from "@/lib/registrations-list"
import { resolveCharterText } from "@/lib/volunteer-charter"
import { hashCharterText } from "@/lib/charter-hash"
import HelpLink from "@/components/admin/HelpLink"
import RecentCancellations from "@/components/admin/registrations/RecentCancellations"
import { loadRecentCancellations } from "@/lib/recent-cancellations-data"
import SectorFilter from "@/components/admin/SectorFilter"
import ShiftSwapsPanel from "@/components/admin/registrations/ShiftSwapsPanel"
import { loadOrganiserSwaps } from "@/lib/shift-swap-data"
import { swapsShipped } from "@/lib/shift-swap-gate"
import { loadSectorFilter } from "@/lib/sector-filter-data"
import { REGISTRATION_WORDS, sectorFilterAnnouncement, sectorFilterValue, withSectorFilter } from "@/lib/sector-filter"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Inscriptions" }

export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ shift?: string; q?: string | string[]; demandes?: string; lien?: string; secteur?: string | string[] }>
}) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params
  const { shift: shiftParam, q, demandes, lien, secteur } = await searchParams
  const initialSearch = (Array.isArray(q) ? q[0] : q)?.slice(0, SEARCH_MAX_LENGTH).trim() || undefined
  // The « Secteur » filter (#1170): the shifts and registrations of the sector's postes only, read now.
  const sector = await loadSectorFilter(db, id, secteur)
  if (!sector) notFound()

  const event = await db.event.findFirst({
    where: { id },
    include: {
      shifts: {
        where: { status: { not: "cancelled" }, ...sector.shiftWhere },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      },
      registrations: {
        where: { status: { in: [...LIVE_STATUSES] }, ...sector.registrationWhere },
        include: { volunteer: true, shift: true },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      },
      sectorLeaders: { select: { roleName: true, email: true } },
      // Share links per group (#947), for the « Par lien de groupe » filter.
      groupLinks: { orderBy: { createdAt: "asc" }, select: { id: true, name: true } },
      organization: { select: { timeZone: true, volunteerCharter: true, hasOrgInsurance: true } },
      // Answers to the custom questions (#483), shown on each registration row.
      questions: { orderBy: [{ archivedAt: "asc" }, { position: "asc" }], select: { label: true, archivedAt: true, answers: { select: { volunteerId: true, values: true } } } },
    },
  })

  if (!event) notFound()
  // The text a volunteer signing up now would accept (#569), to tell it apart from an older one.
  const currentCharterHash = hashCharterText(resolveCharterText(event.organization.volunteerCharter, event.organization.hasOrgInsurance))

  // Shift swaps (#1174, beta): shown once the event allows them, or while it has some to show.
  const swaps = swapsShipped() ? await loadOrganiserSwaps(db, id) : null
  const showSwaps = !!swaps && (swaps.shiftSwapsEnabled || swaps.requests.length > 0)
  const cancellations = await loadRecentCancellations(db, id, orgTimeZone(event.organization), new Date(), sector.shiftWhere)
  // `?shift=` of a shift outside the sector is ignored: the list then opens on the whole sector.
  const initialShiftFilter = shiftParam && event.shifts.some((s) => s.id === shiftParam) ? shiftParam : undefined
  const sectorValue = sectorFilterValue(sector.filter)

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
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <h1 id="page-heading" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Inscriptions</h1>
          <a
            href={withSectorFilter(`/api/admin/events/${id}/export/attendance`, sector.filter)}
            className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Exporter les présences (CSV)
          </a>
        </div>
        <HelpLink route="/admin/events/[id]/registrations" />
        <p className="text-sm text-gray-500">
          {registrationsSummary({
            active: event.registrations.filter(r => r.status === "active").length,
            waiting: event.registrations.filter(r => r.status === "waiting" || r.status === "offered").length,
            requested: event.registrations.filter(r => r.status === "requested").length,
          })}
        </p>
      </div>

      {sector.offered && (
        <SectorFilter
          options={sector.options}
          value={sectorValue}
          announcement={sectorFilterAnnouncement(sector.filter, event.registrations.length, REGISTRATION_WORDS)}
          hint="S'applique aussi à l'export des présences."
          // A shift chosen before may not be in the new sector: the list opens on the whole sector.
          clear={["shift"]}
        />
      )}

      {/* Keyed by the sector: its client state (filters, selection) restarts from the sector's rows. */}
      <RegistrationsManager
        key={sectorValue}
        eventId={id}
        timeZone={orgTimeZone(event.organization)}
        organizerEmail={ctx.session.user?.email ?? null}
        answersByVolunteer={answersByVolunteer(event.questions)}
        initialShiftFilter={initialShiftFilter}
        initialSearch={initialSearch}
        initialRequestsOnly={demandes === "1"}
        groupLinks={event.groupLinks}
        sectorFilter={sectorValue ? { value: sectorValue, label: sector.options.find((o) => o.value === sectorValue)?.label ?? "" } : null}
        initialGroupFilter={lien && (lien === "none" || event.groupLinks.some((l) => l.id === lien)) ? lien : ""}
        initialRegistrations={event.registrations.map((r) => ({
          id: r.id,
          status: r.status,
          source: r.source,
          comment: r.comment,
          phone: r.phone,
          groupLinkId: r.groupLinkId,
          createdAt: r.createdAt.toISOString(),
          waitingPosition: r.waitingPosition,
          checkedInAt: r.checkedInAt?.toISOString() ?? null,
          charterAcceptance: r.charterAcceptedAt
            ? charterAcceptanceLabel({ acceptedAt: r.charterAcceptedAt, hash: r.charterAcceptedHash, currentHash: currentCharterHash, timeZone: orgTimeZone(event.organization) })
            : null,
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
            overlapAllowed: r.shift.overlapAllowed,
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
          // A cumulable role (#986): no overlap warning when adding someone by hand.
          overlapAllowed: s.overlapAllowed,
        }))}
      />

      {showSwaps && <ShiftSwapsPanel eventId={id} requests={swaps!.requests} timeZone={orgTimeZone(event.organization)} />}

      <RecentCancellations rows={cancellations} />
    </div>
  )
}
