import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { resolveOrgSlug } from "@/lib/resolve-org"
import EventPageClient from "./EventPageClient"

export default async function EventPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params
  const rawOrgSlug = (await headers()).get("x-org-slug")
  if (!rawOrgSlug) notFound()

  const resolved = await resolveOrgSlug(rawOrgSlug, `/${eventSlug}`)
  if (!resolved) notFound()
  if (resolved.redirectUrl) redirect(resolved.redirectUrl)

  return <EventPageClient orgSlug={resolved.org.slug} eventSlug={eventSlug} />
}
