// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { cache } from "react"
import { prisma } from "./prisma"
import { orgBaseUrl } from "./urls"
import { PUBLIC_ORG_WHERE } from "./org-approval"

type ResolvedOrg = {
  org: { id: string; slug: string; name: string; publicTitle: string | null }
  redirectUrl: string | null
}

/**
 * Resolves an org subdomain slug to its canonical organization.
 * Returns null if unknown, or a redirectUrl when the slug is historical.
 * path should start with "/" (e.g. "/mon-event") or be "" for the home page.
 */
export const resolveOrgSlug = cache(async function resolveOrgSlug(subdomain: string, path: string = ""): Promise<ResolvedOrg | null> {
  const org = await prisma.organization.findUnique({
    // Public pages: active and allowed to publish (#810: an organisation awaiting validation has none).
    where: { slug: subdomain, ...PUBLIC_ORG_WHERE },
    select: { id: true, slug: true, name: true, publicTitle: true },
  })
  if (org) return { org, redirectUrl: null }

  const history = await prisma.orgSlugHistory.findUnique({
    where: { slug: subdomain },
    include: { organization: { select: { id: true, slug: true, name: true, publicTitle: true, active: true, publicationApprovedAt: true } } },
  })
  if (!history || !history.organization.active || !history.organization.publicationApprovedAt) return null

  const { id, slug, name, publicTitle } = history.organization
  return {
    org: { id, slug, name, publicTitle },
    redirectUrl: `${orgBaseUrl(history.organization.slug)}${path}`,
  }
})
