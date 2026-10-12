import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"
import { prisma } from "@/lib/prisma"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { eventPageMetadata } from "@/lib/event-share"
import { publicEventInclude, publicEventPayload } from "@/lib/public-event"
import { apexBaseUrl, eventPublicUrl } from "@/lib/urls"
import EventPageClient, { type EventData } from "./EventPageClient"
import { consentPrivacyHref } from "@/lib/public-signup"
import { GROUP_PARAM, parseGroupCode, resolveGroupFilter } from "@/lib/group-links"

// Only a published event gives its title and its link preview (#564); unlisted (#414), draft and
// archived events are noindex. The canonical URL is the event's public one on the organization's
// host, whatever host or historical slug the request came through.
//
// The page and its metadata share this one query, and the page awaits it: the metadata is then
// resolved by the time the page's shell is sent, so its tags (description included) land in the
// <head>. Otherwise Next.js may stream them into the <body> when the metadata query finishes last,
// where Lighthouse and HTML-only crawlers don't look for them (#773).
// It reads what the public API reads (src/lib/public-event.ts): the page is server-rendered with
// its data instead of fetching it after hydration, which kept the schedule (and the largest
// paint) waiting for the JavaScript, then for a second request (#773).
const loadEvent = cache((organizationId: string, slug: string) =>
  prisma.event.findFirst({ where: { slug, organizationId }, include: publicEventInclude }),
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

export default async function EventPage({ params, searchParams }: {
  params: Promise<{ eventSlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { eventSlug } = await params
  const rawOrgSlug = (await headers()).get("x-org-slug")
  if (!rawOrgSlug) notFound()

  // Share link per group (#947): `?groupe=<code>`, kept through a historical organisation address.
  const rawGroup = (await searchParams)[GROUP_PARAM]
  const groupCode = parseGroupCode(rawGroup)
  const resolved = await resolveOrgSlug(rawOrgSlug, `/${eventSlug}${groupCode ? `?${GROUP_PARAM}=${groupCode}` : ""}`)
  if (!resolved) notFound()
  if (resolved.redirectUrl) redirect(resolved.redirectUrl)

  // Same condition as the page's data (src/app/api/public/[eventSlug]/route.ts): an unknown or
  // unpublished event answers a real 404 with the 404 page, not « Événement introuvable. ».
  const event = await loadEvent(resolved.org.id, eventSlug)
  if (!event || event.publicStatus !== "published") notFound()

  // The link of this event with that code, if any: an unknown code shows the whole event, no error.
  const groupLink = groupCode
    ? await prisma.eventGroupLink.findFirst({ where: { eventId: event.id, code: groupCode }, select: { code: true, name: true, roleNames: true, hideFull: true } })
    : null
  const groupFilter = resolveGroupFilter(rawGroup === undefined ? null : (groupCode ?? ""), groupLink, [...new Set(event.shifts.map((s) => s.roleName))])

  return (
    <EventPageClient
      privacyHref={consentPrivacyHref()}
      orgSlug={resolved.org.slug}
      eventSlug={eventSlug}
      initialEvent={publicEventPayload(event) as EventData}
      groupFilter={groupFilter}
    />
  )
}
