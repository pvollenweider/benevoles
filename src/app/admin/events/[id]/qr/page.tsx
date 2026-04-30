import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { env } from "@/lib/env"
import QrPrintView from "@/components/admin/QrPrintView"

export const dynamic = "force-dynamic"

export default async function EventQrPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    select: { id: true, slug: true, title: true, location: true, startDate: true, endDate: true },
  })
  if (!event) notFound()

  const baseUrl = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") || ""
  const publicUrl = baseUrl ? `${baseUrl}/events/${event.slug}` : `/events/${event.slug}`

  return (
    <QrPrintView
      eventId={event.id}
      title={event.title}
      location={event.location}
      startDate={event.startDate.toISOString()}
      endDate={event.endDate.toISOString()}
      publicUrl={publicUrl}
      backHref={`/admin/events/${event.id}`}
    />
  )
}
