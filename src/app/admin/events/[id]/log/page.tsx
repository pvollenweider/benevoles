import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import EventLogExplorer from "@/components/admin/EventLogExplorer"

export const dynamic = "force-dynamic"

export default async function EventLogPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ since?: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params
  const { since } = await searchParams
  const initialSince = since && /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : ""

  const event = await db.event.findFirst({ where: { id }, select: { id: true, title: true } })
  if (!event) notFound()

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/events/${id}`} className="text-sm text-blue-600">← {event.title}</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Journal</h1>
        <p className="text-sm text-gray-500">Qui a fait quoi, et pourquoi — explorez, rejouez une plage horaire ou lisez le récit d&apos;un enchaînement.</p>
      </div>

      <EventLogExplorer eventId={id} initialSince={initialSince} />
    </div>
  )
}
