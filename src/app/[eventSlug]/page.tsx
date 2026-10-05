import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { eventPageMetadata } from "@/lib/event-share"
import { apexBaseUrl, eventPublicUrl } from "@/lib/urls"
import EventPageClient from "./EventPageClient"

// Only a published event gives its title and its link preview (#564); unlisted (#414), draft and
// archived events are noindex. The canonical URL is the event's public one on the organization's
// host, whatever host or historical slug the request came through.
export async function generateMetadata({ params }: { params: Promise<{ eventSlug: string }> }): Promise<Metadata> {
  const { eventSlug } = await params
  const rawOrgSlug = (await headers()).get("x-org-slug")
  if (!rawOrgSlug) return {}
  const resolved = await resolveOrgSlug(rawOrgSlug, `/${eventSlug}`)
  if (!resolved || resolved.redirectUrl) return {}
  const event = await prisma.event.findFirst({
    where: { slug: eventSlug, organizationId: resolved.org.id },
    select: { slug: true, title: true, description: true, startDate: true, endDate: true, publicStatus: true, isListed: true },
  })
  if (!event) return {} // deleted, or another organization's slug
  return eventPageMetadata(
    { ...event, organizationName: resolved.org.name },
    // The platform's social card lives on the apex host (src/app/og-image.png/route.tsx).
    { canonicalUrl: eventPublicUrl(resolved.org.slug, event.slug), imageUrl: `${apexBaseUrl()}/og-image.png` },
  )
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
