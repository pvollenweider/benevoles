import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { eventPageMetadata } from "@/lib/event-share"
import { apexBaseUrl, eventPublicUrl } from "@/lib/urls"
import EventPageClient from "./EventPageClient"

// Only a published event gives its title and its link preview (#564); unlisted (#414), draft and
// archived events are noindex. The canonical URL is the event's public one on the organization's
// host, whatever host or historical slug the request came through.
//
// The page and its metadata share this one query, and the page awaits it: the metadata is then
// resolved by the time the page's shell is sent, so its tags (description included) land in the
// <head>. Otherwise Next.js may stream them into the <body> when the metadata query finishes last,
// where Lighthouse and HTML-only crawlers don't look for them (#773).
const loadEvent = cache((organizationId: string, slug: string) =>
  prisma.event.findFirst({
    where: { slug, organizationId },
    select: { slug: true, title: true, description: true, startDate: true, endDate: true, publicStatus: true, isListed: true },
  }),
)

export async function generateMetadata({ params }: { params: Promise<{ eventSlug: string }> }): Promise<Metadata> {
  const { eventSlug } = await params
  const rawOrgSlug = (await headers()).get("x-org-slug")
  if (!rawOrgSlug) return {}
  const resolved = await resolveOrgSlug(rawOrgSlug, `/${eventSlug}`)
  if (!resolved || resolved.redirectUrl) return {}
  const event = await loadEvent(resolved.org.id, eventSlug)
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

  // Same condition as the page's data (src/app/api/public/[eventSlug]/route.ts): an unknown or
  // unpublished event answers a real 404 with the 404 page, not « Événement introuvable. ».
  const event = await loadEvent(resolved.org.id, eventSlug)
  if (!event || event.publicStatus !== "published") notFound()

  return <EventPageClient orgSlug={resolved.org.slug} eventSlug={eventSlug} />
}
