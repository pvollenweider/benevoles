// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import EventPageClient from "@/app/[eventSlug]/EventPageClient"
import { consentPrivacyHref } from "@/lib/public-signup"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Aperçu bénévole", robots: { index: false, follow: false } }

// The public event page as volunteers will see it, drafts included (#370): same component, fed by
// the admin preview API, registering nothing.
export default async function EventPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params

  const event = await ctx.db.event.findFirst({
    where: { id },
    select: { id: true, slug: true, organization: { select: { slug: true } } },
  })
  if (!event) notFound()

  return (
    <EventPageClient
      privacyHref={consentPrivacyHref()}
      orgSlug={event.organization.slug}
      eventSlug={event.slug}
      preview={{ eventId: event.id, adminEventUrl: `/admin/events/${event.id}` }}
    />
  )
}
