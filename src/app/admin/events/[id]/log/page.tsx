import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import EventLogExplorer from "@/components/admin/EventLogExplorer"

export const dynamic = "force-dynamic"

export default async function EventLogPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params

  const event = await db.event.findFirst({ where: { id }, select: { id: true, title: true } })
  if (!event) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/events/${id}`} className="text-sm text-blue-600">← {event.title}</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Journal</h1>
        <p className="text-sm text-gray-500">Qui a fait quoi, et pourquoi — explorez, rejouez une plage horaire ou lisez le récit d&apos;un enchaînement.</p>
      </div>

      <EventLogExplorer eventId={id} />
    </div>
  )
}
