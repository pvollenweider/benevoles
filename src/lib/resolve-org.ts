import { cache } from "react"
import { prisma } from "./prisma"
import { orgBaseUrl } from "./urls"

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
    where: { slug: subdomain, active: true },
    select: { id: true, slug: true, name: true, publicTitle: true },
  })
  if (org) return { org, redirectUrl: null }

  const history = await prisma.orgSlugHistory.findUnique({
    where: { slug: subdomain },
    include: { organization: { select: { id: true, slug: true, name: true, publicTitle: true, active: true } } },
  })
  if (!history || !history.organization.active) return null

  return {
    org: history.organization,
    redirectUrl: `${orgBaseUrl(history.organization.slug)}${path}`,
  }
})
