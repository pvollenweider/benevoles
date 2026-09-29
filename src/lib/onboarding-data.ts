// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import { onboardingSteps, showOnboarding, type OnboardingStep } from "./onboarding"
import { eventPublicUrl } from "./urls"

/**
 * Facts for the first-run checklist (#369), read with the organization-scoped client. Returns
 * null when the list shouldn't show (all required steps done, or dismissed).
 */
export async function loadOnboarding(db: OrgScopedPrisma, organizationId: string): Promise<OnboardingStep[] | null> {
  const [org, firstEvent, published, activeShiftCount, registrationCount] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { slug: true, publicTitle: true, volunteerCharter: true, timeZone: true, onboardingDismissedAt: true },
    }),
    db.event.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }),
    db.event.findFirst({ where: { publicStatus: "published" }, orderBy: { createdAt: "asc" }, select: { slug: true } }),
    db.shift.count({ where: { status: { not: "cancelled" } } }),
    db.registration.count(),
  ])
  if (!org) return null

  const steps = onboardingSteps({
    publicTitle: org.publicTitle,
    charterCustomized: org.volunteerCharter !== null,
    timeZone: org.timeZone,
    firstEventId: firstEvent?.id ?? null,
    activeShiftCount,
    publishedEventUrl: published ? eventPublicUrl(org.slug, published.slug) : null,
    registrationCount,
  })
  return showOnboarding(steps, org.onboardingDismissedAt) ? steps : null
}
