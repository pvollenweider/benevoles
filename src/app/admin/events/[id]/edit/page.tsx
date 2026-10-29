import { notFound, redirect } from "next/navigation"
import { utcToLocalInput } from "@/lib/registration-window"
import { orgTimeZone } from "@/lib/time-zone"
import { cancelDeadlineFormFrom } from "@/lib/cancel-deadline"
import { getOrgContext } from "@/lib/auth-guard"
import EventForm from "@/components/admin/EventForm"
import type { Metadata } from "next"
import Link from "next/link"
import WizardSteps from "@/components/admin/WizardSteps"
import HelpLink from "@/components/admin/HelpLink"
import DeleteEventSection from "@/components/admin/DeleteEventSection"
import FocusTargetHeading from "@/components/admin/event-nav/FocusTargetHeading"
import { hasLevel } from "@/lib/permissions"
import { DELETE_SECTION_ID } from "@/lib/event-nav"
import EventSectorsOption from "@/components/admin/EventSectorsOption"
import EventShiftSwapsOption from "@/components/admin/EventShiftSwapsOption"
import EventWorkloadPolicyCard from "@/components/admin/EventWorkloadPolicyCard"
import EventAvailabilityOption from "@/components/admin/EventAvailabilityOption"
import { loadAvailabilityOption } from "@/lib/event-availability-server"
import { loadWorkloadPolicyState } from "@/lib/workload-policy-data"
import { canAdoptBeta } from "@/lib/beta-access"
import { sectorsAdopted, sectorsOptionOffered } from "@/lib/sectors"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Informations de l'événement" }

export default async function EditEventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ wizard?: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params
  const { wizard } = await searchParams

  const event = await db.event.findFirst({ where: { id }, include: { organization: { select: { timeZone: true } } } })
  if (!event) notFound()
  const timeZone = orgTimeZone(event.organization)
  // Sectors (#1147, beta): offered while the organisation can adopt them, or once the event has them.
  // The gate is read only for an event that has neither.
  const sectorsOffered = sectorsOptionOffered(event, event.sectorsEnabled || sectorsAdopted(event) || await canAdoptBeta(event.organizationId, "sectors"))

  // Shift swaps (#1174, beta): offered while the organisation can adopt them, or once the event has them.
  const swapsOffered = event.shiftSwapsEnabled || await canAdoptBeta(event.organizationId, "shiftSwaps")
  // Breaks and workload protection (#1171, beta): offered while it can be adopted, or once the event has it.
  const workload = await loadWorkloadPolicyState(db, event.organizationId, event.id)
  // Dated availability (#1146, beta): offered while it can be adopted, or once the event has it.
  const availability = await loadAvailabilityOption(db, event.organizationId, event.id)

  // Everything that permanent deletion would erase (all statuses, cancelled shifts included),
  // only counted for an archived event.
  const isArchived = event.publicStatus === "archived"
  const [shiftTotal, registrationTotal, invitationTotal] = isArchived && !wizard
    ? await Promise.all([
        db.shift.count({ where: { eventId: id } }),
        db.registration.count({ where: { eventId: id } }),
        db.memberInvite.count({ where: { eventId: id } }),
      ])
    : [0, 0, 0]

  const initialData = {
    id: event.id,
    title: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    startDate: event.startDate.toISOString().split("T")[0],
    endDate: event.endDate.toISOString().split("T")[0],
    publicInstructions: event.publicInstructions ?? "",
    confirmationMessage: event.confirmationMessage ?? "",
    reminderMessage: event.reminderMessage ?? "",
    requirePhone: event.requirePhone,
    shiftRosterEnabled: event.shiftRosterEnabled,
    remindersEnabled: event.remindersEnabled,
    publicStatus: event.publicStatus as "draft" | "published" | "archived",
    isListed: event.isListed,
    registrationsOpen: event.registrationsOpen,
    registrationOpensAt: utcToLocalInput(event.registrationOpensAt, timeZone),
    registrationClosesAt: utcToLocalInput(event.registrationClosesAt, timeZone),
    accentColorKey: event.accentColorKey,
    latitude: event.latitude,
    longitude: event.longitude,
    dayContactName: event.dayContactName ?? "",
    dayContactPhone: event.dayContactPhone ?? "",
    cancelDeadline: cancelDeadlineFormFrom(event),
    showSchedule: (event.showSchedule ?? []) as Array<{ name: string; date: string; startTime: string; endTime: string }>,
  }

  return (
    <div className="max-w-2xl space-y-6">
      {wizard && <WizardSteps current={1} eventId={id} />}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 id="page-heading" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Informations de l&apos;événement</h1>
          <HelpLink route="/admin/events/[id]/edit" />
        </div>
        {wizard && (
          <Link
            href={`/admin/events/${id}/shifts?wizard=1`}
            className="inline-block bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Continuer : postes et créneaux
          </Link>
        )}
      </div>
      <EventForm initialData={initialData} timeZone={timeZone} />
      {swapsOffered && <EventShiftSwapsOption eventId={event.id} initialEnabled={event.shiftSwapsEnabled} initialApproval={event.shiftSwapsApproval} />}
      {workload?.adoptable && (
        <EventWorkloadPolicyCard
          eventId={event.id}
          initialEnabled={workload.enabled}
          initialValues={workload.values}
          initialIncomplete={workload.incomplete}
          initialFindings={workload.findings}
          timeZone={workload.timeZone}
          horizon={workload.horizon}
          placesInfo={{ shiftsWithoutPlace: workload.shiftsWithoutPlace, activePlaces: workload.activePlaces }}
          peopleWithoutBirthDate={workload.peopleWithoutBirthDate}
        />
      )}
      {availability && <EventAvailabilityOption eventId={event.id} initial={availability} />}
      {sectorsOffered && <EventSectorsOption eventId={event.id} initialEnabled={event.sectorsEnabled} adopted={sectorsAdopted(event)} />}
      {!wizard && (
        <section aria-labelledby={DELETE_SECTION_ID} className="border-t border-gray-200 pt-6 space-y-3">
          <FocusTargetHeading id={DELETE_SECTION_ID} className="text-base font-semibold text-gray-900">Suppression définitive</FocusTargetHeading>
          {!hasLevel(ctx.session.user?.role, "owner") ? (
            // Permanent deletion is for owners (#469); the route refuses it too.
            <p className="text-sm text-gray-700">Seul un propriétaire de l&apos;organisation peut supprimer définitivement cet événement.</p>
          ) : isArchived ? (
            <DeleteEventSection
              eventId={event.id}
              title={event.title}
              counts={{ shifts: shiftTotal, registrations: registrationTotal, invitations: invitationTotal }}
              exportUrl={`/api/admin/events/${event.id}/export/pdf`}
            />
          ) : (
            <p className="text-sm text-gray-700">Archivez cet événement pour pouvoir le supprimer : bouton « Autres actions », en haut, puis Archiver.</p>
          )}
        </section>
      )}
    </div>
  )
}
