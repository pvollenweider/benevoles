import { leaderRoleNamesOf } from "@/lib/leader-scope"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import { belowMinimumSentence, staffingHeadline, staffingSummary } from "@/lib/staffing"
import MilestonesSection from "@/components/admin/MilestonesSection"
import EventLifecycleBar from "@/components/admin/EventLifecycleBar"
import ReviewChecklist from "@/components/admin/ReviewChecklist"
import HelpLink from "@/components/admin/HelpLink"
import DocMoreLink from "@/components/DocMoreLink"
import { SECTION_DOC_LINKS, docHref } from "@/lib/help-links"
import { orgTimeZone } from "@/lib/time-zone"
import { eligibleOwnerWhere } from "@/lib/milestones"
import { LIVE_STATUSES, OCCUPYING_STATUSES } from "@/lib/registration-capacity"
import { localDay } from "@/lib/day-of"
import { hasUpcomingShift } from "@/lib/event-wizard"
import { parseNotificationSettings } from "@/lib/notification-settings"
import { remindersState, remindersSummary } from "@/lib/automatic-reminders"
import { loadAttention } from "@/lib/attention-data"
import { eventAttentionItems } from "@/lib/attention"
import { loadReviewChecks } from "@/lib/review-checks-data"
import ArchiveFromList from "@/components/admin/ArchiveFromList"
import { lastMessageSentence, nextAutomaticReminder, placesSentence } from "@/lib/event-overview"

export const dynamic = "force-dynamic"

const linkClass =
  "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
const sectionClass = "space-y-2"
const h2Class = "text-base font-semibold text-gray-900"

/**
 * The overview of an event (« Aperçu »), in task order: where people are missing, what to handle,
 * the next steps and milestones, then the communication. The header (title, stage, primary
 * action, « ⋯ », tabs) comes from the layout.
 */
export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db, organizationId } = ctx

  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    include: {
      organization: { select: { timeZone: true, notificationSettings: true } },
      shifts: {
        where: { status: { not: "cancelled" } },
        include: {
          registrations: {
            where: { status: { in: [...LIVE_STATUSES] } },
            select: { id: true, status: true },
          },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      },
      milestones: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], include: { owner: { select: { name: true } } } },
      sectorLeaders: { select: { roleName: true, sectorId: true } },
      sectors: { select: { id: true, archivedAt: true } },
    },
  })

  if (!event) notFound()

  const now = new Date()
  const timeZone = orgTimeZone(event.organization)
  const published = event.publicStatus === "published"
  const isDraft = event.publicStatus === "draft"

  // The possible owners of a milestone (#985): the organisation's active admin accounts.
  // « À traiter » (#372) for this event only; the checklist (#401) while it is a draft.
  // Invited members (#1098): the published stage's « Inviter » step says how many.
  const [team, attention, review, lastMessage, invitedCount] = await Promise.all([
    db.adminUser.findMany({ where: eligibleOwnerWhere(organizationId), select: { id: true, name: true }, orderBy: { name: "asc" } }),
    published ? loadAttention(db, organizationId, now, { eventId: id }).then((items) => eventAttentionItems(items, id)) : Promise.resolve([]),
    isDraft ? loadReviewChecks(db, id, now) : Promise.resolve(null),
    db.targetedMessage.findFirst({ where: { eventId: id }, orderBy: { createdAt: "desc" }, select: { subject: true, createdAt: true, recipientCount: true } }),
    published ? db.memberInvite.count({ where: { eventId: id } }) : Promise.resolve(0),
  ])

  const count = (status: string) => event.shifts.reduce((n, sh) => n + sh.registrations.filter((r) => r.status === status).length, 0)
  const totalCapacity = event.shifts.reduce((s, sh) => s + sh.capacity, 0)
  // Requests (#484) and waitlist offers hold their spot: the spots left are those the public
  // form would still give, not capacity minus the confirmed.
  const totalHeld = event.shifts.reduce(
    (s, sh) => s + sh.registrations.filter((r) => (OCCUPYING_STATUSES as readonly string[]).includes(r.status)).length,
    0
  )
  const places = placesSentence({ capacity: totalCapacity, confirmed: count("active"), requested: count("requested"), left: Math.max(0, totalCapacity - totalHeld) })
  const staffing = staffingSummary(
    event.shifts.map((sh) => ({
      id: sh.id, roleName: sh.roleName, label: sh.label, date: sh.date.toISOString().slice(0, 10),
      startTime: sh.startTime, endTime: sh.endTime, capacity: sh.capacity, minVolunteers: sh.minVolunteers, closed: sh.status === "closed",
      active: sh.registrations.filter((r) => r.status === "active").length,
      waiting: sh.registrations.filter((r) => r.status === "waiting" || r.status === "offered").length,
      requested: sh.registrations.filter((r) => r.status === "requested").length,
    })),
    // A poste with its own leader or its sector's (#1169).
    leaderRoleNamesOf(event.sectorLeaders, event.shifts, event.sectors),
  )
  const belowMinimum = belowMinimumSentence(staffing.belowMinimum.length)

  // What the reminders cron will actually send for this event (#705), as on the review page (#565).
  const shiftTimes = event.shifts.map((sh) => ({ date: sh.date.toISOString().slice(0, 10), startTime: sh.startTime, endTime: sh.endTime }))
  const reminderFacts = {
    eventEnabled: event.remindersEnabled,
    organization: parseNotificationSettings(event.organization.notificationSettings).reminders,
    upcomingShifts: hasUpcomingShift(shiftTimes, now, timeZone),
  }
  const reminders = remindersSummary({ ...reminderFacts, eventId: event.id, published })
  const state = remindersState(reminderFacts)
  const nextReminder = published && "on" in state ? nextAutomaticReminder(shiftTimes, state.on, now, timeZone) : null
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })

  const base = `/admin/events/${event.id}`

  return (
    <div className="space-y-8">
      {/* The event's title (h1) is in the layout's header; the help of this tab comes first here. */}
      <HelpLink route="/admin/events/[id]" />
      <section aria-labelledby="overview-staffing" className={sectionClass}>
        <h2 id="overview-staffing" className={h2Class}>Où manque-t-il du monde ?</h2>
        <p className="text-sm text-gray-800">
          {staffingHeadline(staffing.totals)}
          {belowMinimum && ` ${belowMinimum}`}
          {staffing.totals.waiting > 0 && ` ${staffing.totals.waiting} personne${staffing.totals.waiting > 1 ? "s" : ""} en liste d'attente.`}
        </p>
        {places && <p className="text-sm text-gray-800">{places}</p>}
        <p className="text-sm">
          {staffing.totals.shifts > 0 ? (
            <Link href={`${base}/staffing`} className={linkClass}>
              {staffing.underfilled.length > 0 ? `Voir les créneaux à compléter (${staffing.underfilled.length})` : "Voir le détail des créneaux"}
            </Link>
          ) : (
            <Link href={`${base}/shifts`} className={linkClass}>Ajouter des créneaux</Link>
          )}
        </p>
      </section>

      {published && (
        <section aria-labelledby="overview-todo" className={sectionClass}>
          <h2 id="overview-todo" className={h2Class}>À traiter</h2>
          {attention.length === 0 ? (
            <p className="text-sm text-gray-700">Rien à traiter pour l&apos;instant : ni demande en attente, ni place proposée qui expire, ni jalon en retard.</p>
          ) : (
            // role="list": Safari/VoiceOver drops list semantics once Tailwind removes the bullets.
            <ul role="list" className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {attention.map((item) => (
                <li key={item.id} className="px-4 py-3 text-sm flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="min-w-0 text-gray-900">
                    {item.severity === "high" && <span className="font-semibold text-red-800">Urgent : </span>}
                    {item.message}
                  </p>
                  {/* « L'archiver » archives here (#1098); the event header's h1 takes the focus. */}
                  {item.archiveEventId
                    ? <ArchiveFromList eventId={item.archiveEventId} eventTitle={event.title} focusId="page-heading" />
                    : <Link href={item.href} className={linkClass}>{item.action}</Link>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="overview-next" className={sectionClass}>
        <h2 id="overview-next" className={h2Class}>Prochaines étapes</h2>
        {review ? (
          <>
            <ReviewChecklist checks={review.checks} />
            <p className="text-sm">
              <Link href={`${base}/review`} className={linkClass}>Vérifier avant publication</Link>
              <span className="text-gray-700"> : la même liste, l&apos;aperçu bénévole et la publication.</span>
            </p>
          </>
        ) : (
          <EventLifecycleBar
            eventId={event.id}
            facts={{
              publicStatus: event.publicStatus,
              isListed: event.isListed,
              endDate: event.endDate.toISOString().slice(0, 10),
              // « Terminé » flips at midnight in the organization's time zone, not UTC.
              today: localDay(now, timeZone),
              shiftCount: event.shifts.length,
              confirmationMessage: event.confirmationMessage,
              remindersEnabled: event.remindersEnabled,
              invitedCount,
            }}
          />
        )}
      </section>

      <section aria-labelledby="jalons" className={sectionClass}>
        <h2 id="jalons" tabIndex={-1} className={`${h2Class} focus:outline-none scroll-mt-4`}>Jalons</h2>
        <p className="text-sm"><DocMoreLink href={docHref(SECTION_DOC_LINKS.admin.milestones)} about="les jalons" /></p>
        <MilestonesSection
          eventId={event.id}
          initialMilestones={event.milestones.map((m) => ({
            id: m.id,
            title: m.title,
            dueDate: m.dueDate.toISOString(),
            done: m.done,
            ownerId: m.ownerId,
            ownerName: m.owner?.name ?? null,
          }))}
          team={team}
          timeZone={timeZone}
        />
      </section>

      <section aria-labelledby="overview-messages" className={sectionClass}>
        <h2 id="overview-messages" className={h2Class}>Messages</h2>
        <ul role="list" className="text-sm text-gray-800 space-y-1">
          <li>
            <span className="font-medium text-gray-900">Dernier message : </span>
            {lastMessage ? lastMessageSentence(lastMessage, timeZone) : "aucun message envoyé pour l'instant."}
          </li>
          <li>
            {nextReminder
              ? <><span className="font-medium text-gray-900">Prochain rappel automatique : </span>{nextReminder.label}, le {day(nextReminder.day)}, pour les inscrits.</>
              : <>{reminders.title}.{!published && " Ils ne partent qu'une fois l'événement publié."}</>}
          </li>
        </ul>
        <p className="text-sm">
          <Link href={`${base}/message`} className={linkClass}>Ouvrir les messages</Link>
          <span className="text-gray-700"> : écrire aux bénévoles, rappels et messages envoyés.</span>
        </p>
      </section>
    </div>
  )
}
