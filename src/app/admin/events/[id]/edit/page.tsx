import { notFound, redirect } from "next/navigation"
import { utcToLocalInput } from "@/lib/registration-window"
import { orgTimeZone } from "@/lib/time-zone"
import { getOrgContext } from "@/lib/auth-guard"
import EventForm from "@/components/admin/EventForm"
import Link from "next/link"
import WizardSteps from "@/components/admin/WizardSteps"

export const dynamic = "force-dynamic"

export default async function EditEventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ wizard?: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params
  const { wizard } = await searchParams

  const event = await db.event.findFirst({ where: { id }, include: { organization: { select: { timeZone: true } } } })
  if (!event) notFound()
  const timeZone = orgTimeZone(event.organization)

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
    publicStatus: event.publicStatus as "draft" | "published" | "archived",
    isListed: event.isListed,
    registrationsOpen: event.registrationsOpen,
    registrationOpensAt: utcToLocalInput(event.registrationOpensAt, timeZone),
    registrationClosesAt: utcToLocalInput(event.registrationClosesAt, timeZone),
    accentColorKey: event.accentColorKey,
    latitude: event.latitude,
    longitude: event.longitude,
    showSchedule: (event.showSchedule ?? []) as Array<{ name: string; date: string; startTime: string; endTime: string }>,
  }

  return (
    <div className="max-w-2xl space-y-6">
      {wizard && <WizardSteps current={1} eventId={id} />}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href={`/admin/events/${id}`} className="text-sm text-blue-600">← Retour</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-2">Modifier l&apos;événement</h1>
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
    </div>
  )
}
