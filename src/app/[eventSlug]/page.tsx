import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { robotsFor } from "@/lib/event-visibility"
import EventPageClient from "./EventPageClient"

// An unlisted event (#414) is reachable by its link but not indexed: robots noindex/nofollow.
export async function generateMetadata({ params }: { params: Promise<{ eventSlug: string }> }): Promise<Metadata> {
  const { eventSlug } = await params
  const rawOrgSlug = (await headers()).get("x-org-slug")
  if (!rawOrgSlug) return {}
  const resolved = await resolveOrgSlug(rawOrgSlug, `/${eventSlug}`)
  if (!resolved || resolved.redirectUrl) return {}
  const event = await prisma.event.findFirst({
    where: { slug: eventSlug, organizationId: resolved.org.id },
    select: { title: true, publicStatus: true, isListed: true },
  })
  const robots = robotsFor(event)
  return { ...(event ? { title: event.title } : {}), ...(robots ? { robots } : {}) }
}

export default async function EventPage({ params }: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await params
  const rawOrgSlug = (await headers()).get("x-org-slug")
  if (!rawOrgSlug) notFound()

  const resolved = await resolveOrgSlug(rawOrgSlug, `/${eventSlug}`)
  if (!resolved) notFound()
  if (resolved.redirectUrl) redirect(resolved.redirectUrl)

  return <EventPageClient orgSlug={resolved.org.slug} eventSlug={eventSlug} />
}
