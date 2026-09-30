import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { eventPageMetadata } from "@/lib/event-visibility"
import EventPageClient from "./EventPageClient"

// Only a published event gives its title; unlisted (#414), draft and archived events are noindex.
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
  return eventPageMetadata(event)
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
