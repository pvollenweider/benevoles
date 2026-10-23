import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import EventLogExplorer from "@/components/admin/EventLogExplorer"
import HelpLink from "@/components/admin/HelpLink"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Journal" }

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
        <h1 id="page-heading" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none">Journal</h1>
        <HelpLink route="/admin/events/[id]/log" />
        <p className="text-sm text-gray-500">Qui a fait quoi, et pourquoi — explorez, rejouez une plage horaire ou lisez le récit d&apos;un enchaînement.</p>
      </div>

      <EventLogExplorer eventId={id} initialSince={initialSince} />
    </div>
  )
}
