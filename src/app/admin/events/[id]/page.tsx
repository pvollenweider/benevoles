import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import { formatShortDate } from "@/lib/utils"
import { staffingHeadline, staffingSummary } from "@/lib/staffing"
import { eventPublicUrl } from "@/lib/urls"
import StatusBadge from "@/components/admin/StatusBadge"
import PublishToggle from "@/components/admin/PublishToggle"
import ArchiveButton from "@/components/admin/ArchiveButton"
import DeleteEventSection from "@/components/admin/DeleteEventSection"
import SendReminderButton from "@/components/admin/SendReminderButton"
import MilestonesSection from "@/components/admin/MilestonesSection"
import { isUnlistedPublic, UNLISTED_HINT } from "@/lib/event-visibility"

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
      milestones: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] },
      sectorLeaders: { select: { roleName: true } },
    },
  })

  if (!event) notFound()

  // Everything that permanent deletion would erase (all statuses, cancelled
  // shifts included), only computed for an archived event.
  const isArchived = event.publicStatus === "archived"
  const [shiftTotal, registrationTotal, invitationTotal] = isArchived
    ? await Promise.all([
        db.shift.count({ where: { eventId: id } }),
        db.registration.count({ where: { eventId: id } }),
        db.memberInvite.count({ where: { eventId: id } }),
      ])
    : [0, 0, 0]

  const totalCapacity = event.shifts.reduce((s, sh) => s + sh.capacity, 0)
  const totalRegistered = event.shifts.reduce(
    (s, sh) => s + sh.registrations.filter((r) => r.status === "active").length,
    0
  )
  const staffing = staffingSummary(
    event.shifts.map((sh) => ({
      id: sh.id, roleName: sh.roleName, label: sh.label, date: sh.date.toISOString().slice(0, 10),
      startTime: sh.startTime, endTime: sh.endTime, capacity: sh.capacity, closed: sh.status === "closed",
      active: sh.registrations.filter((r) => r.status === "active").length,
      waiting: sh.registrations.filter((r) => r.status !== "active").length,
    })),
    event.sectorLeaders.map((l) => l.roleName),
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
          {isUnlistedPublic(event) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900">
              non répertorié
            </span>
          )}
          <PublishToggle eventId={event.id} currentStatus={event.publicStatus} />
          <ArchiveButton eventId={event.id} currentStatus={event.publicStatus} />
          <Link
            href={`/admin/events/${event.id}/edit`}
            className="text-sm border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors"
          >
            Modifier
          </Link>
          <Link
            href={`/admin/events/${event.id}/preview`}
            className="text-sm border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors"
          >
            Prévisualiser comme un bénévole
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

      {isUnlistedPublic(event) && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
          <strong>Publié — non répertorié.</strong> {UNLISTED_HINT} L&apos;événement n&apos;apparaît pas sur la page publique de l&apos;organisation ; partagez son lien ou son QR code.
        </p>
      )}

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
        <Link href={`/admin/events/${event.id}/print`} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
          Imprimer
        </Link>
        <a href={`/api/admin/events/${event.id}/export/pdf`} target="_blank" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
          Exporter PDF ↗
        </a>
        <Link href={`/admin/events/${event.id}/log`} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
          Journal
        </Link>
        <Link href={`/admin/events/${event.id}/pages`} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
          Pages
        </Link>
        <Link href={`/admin/events/${event.id}/sector-leaders`} className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
          Responsables de secteur
        </Link>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Jalons</h2>
        <MilestonesSection
          eventId={event.id}
          initialMilestones={event.milestones.map((m) => ({
            id: m.id,
            title: m.title,
            dueDate: m.dueDate.toISOString(),
            done: m.done,
          }))}
        />
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Communications</h2>
        <div className="mb-4">
          <Link
            href={`/admin/events/${event.id}/message`}
            className="inline-block bg-white border border-gray-300 text-gray-800 rounded-full px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Écrire aux bénévoles
          </Link>
          <p className="text-xs text-gray-600 mt-1">Un email à tous les inscrits, à un poste, à un créneau ou à la liste d&apos;attente, avec objet, aperçu et nombre de destinataires.</p>
        </div>
        <SendReminderButton
          eventId={event.id}
          hasMessage={!!event.reminderMessage?.trim()}
          volunteerCount={uniqueVolunteerIds.size}
          lastSentAt={event.reminderSentAt?.toISOString() ?? null}
        />
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Où manque-t-il du monde ?</h2>
        <p className="text-sm text-gray-800">
          {staffingHeadline(staffing.totals)}
          {staffing.totals.waiting > 0 && ` ${staffing.totals.waiting} personne${staffing.totals.waiting > 1 ? "s" : ""} en liste d'attente.`}
        </p>
        {staffing.totals.shifts > 0 && (
          <Link href={`/admin/events/${event.id}/staffing`} className="inline-block mt-1 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            {staffing.underfilled.length > 0 ? `Voir les créneaux à compléter (${staffing.underfilled.length})` : "Voir le détail des créneaux"}
          </Link>
        )}
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Suppression définitive</h2>
        {isArchived ? (
          <DeleteEventSection
            eventId={event.id}
            title={event.title}
            counts={{ shifts: shiftTotal, registrations: registrationTotal, invitations: invitationTotal }}
            exportUrl={`/api/admin/events/${event.id}/export/pdf`}
          />
        ) : (
          <p className="text-sm text-gray-600">Archivez cet événement pour pouvoir le supprimer.</p>
        )}
      </div>
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
