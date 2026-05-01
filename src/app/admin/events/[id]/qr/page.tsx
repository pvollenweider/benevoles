import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { eventPublicUrl } from "@/lib/urls"
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
    select: { id: true, slug: true, title: true, location: true, startDate: true, endDate: true, organization: { select: { slug: true } } },
  })
  if (!event) notFound()

  const publicUrl = eventPublicUrl(event.organization.slug, event.slug)

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
