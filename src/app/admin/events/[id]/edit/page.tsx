import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import EventForm from "@/components/admin/EventForm"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params

  const event = await db.event.findFirst({ where: { id } })
  if (!event) notFound()

  const initialData = {
    id: event.id,
    title: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    startDate: event.startDate.toISOString().split("T")[0],
    endDate: event.endDate.toISOString().split("T")[0],
    publicInstructions: event.publicInstructions ?? "",
    confirmationMessage: event.confirmationMessage ?? "",
    publicStatus: event.publicStatus as "draft" | "published" | "archived",
    showSchedule: (event.showSchedule ?? []) as Array<{ name: string; date: string; startTime: string; endTime: string }>,
  }

  return (
    <div className="max-w-2xl">
      <Link href={`/admin/events/${id}`} className="text-sm text-blue-600">← Retour</Link>
      <h1 className="text-xl font-bold text-gray-900 mt-2 mb-6">Modifier l'événement</h1>
      <EventForm initialData={initialData} />
    </div>
  )
}
