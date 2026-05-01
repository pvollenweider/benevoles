import { headers } from "next/headers"
import { notFound } from "next/navigation"
import EventPageClient from "./EventPageClient"

export default async function EventPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params
  const orgSlug = (await headers()).get("x-org-slug")
  if (!orgSlug) notFound()
  return <EventPageClient orgSlug={orgSlug} eventSlug={eventSlug} />
}
