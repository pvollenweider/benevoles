// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
// Organization itself isn't tenant-scoped, and the slug checks look at other orgs on purpose.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"
import { isValidTimeZone } from "@/lib/time-zone"
import { orgBaseUrl } from "@/lib/urls"
import { isReservedOrgSlug, RESERVED_SLUG_ERROR } from "@/lib/org-subdomain"
import { parseHourRateInput } from "@/lib/volunteer-hour-value"

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

export async function PATCH(req: Request) {
  const guard = await requireOrgSession("owner")
  if (guard instanceof NextResponse) return guard
  const { organizationId } = guard

  const body = await req.json().catch(() => ({}))
  const updates: { name?: string; slug?: string; volunteerCharter?: string | null; hasOrgInsurance?: boolean; shiftRosterDefault?: boolean; publicTitle?: string | null; timeZone?: string | null; onboardingDismissedAt?: Date | null; volunteerHourRateCents?: number | null; volunteerHourRateCurrency?: string | null; volunteerHourRateSetAt?: Date | null } = {}
  let oldSlug: string | null = null

  if (typeof body.name === "string") {
    const name = body.name.trim()
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: "Nom invalide (2–100 caractères)." }, { status: 400 })
    }
    updates.name = name
  }

  if (typeof body.slug === "string") {
    const slug = body.slug.trim().toLowerCase()
    if (!SLUG_RE.test(slug) || slug.length < 2 || slug.length > 40) {
      return NextResponse.json(
        { error: "Slug invalide (2–40 caractères, lettres minuscules/chiffres/tirets, sans tiret en début ou fin)." },
        { status: 400 },
      )
    }
    if (isReservedOrgSlug(slug)) return NextResponse.json({ error: RESERVED_SLUG_ERROR }, { status: 400 })

    const current = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { slug: true },
    })
    if (!current) return NextResponse.json({ error: "Organisation introuvable." }, { status: 404 })

    if (current.slug !== slug) {
      const taken = await prisma.organization.findFirst({ where: { slug, id: { not: organizationId } } })
      if (taken) return NextResponse.json({ error: "Ce slug est déjà utilisé par une autre organisation." }, { status: 409 })

      // Deliberately cross-tenant: is this slug reserved by *another* organization's history?
      const inHistory = await prisma.orgSlugHistory.findFirst({
        where: { slug, organizationId: { not: organizationId } },
      })
      if (inHistory) return NextResponse.json({ error: "Ce slug est réservé." }, { status: 409 })

      oldSlug = current.slug
      updates.slug = slug
    }
  }

  if ("volunteerCharter" in body) {
    updates.volunteerCharter = typeof body.volunteerCharter === "string" && body.volunteerCharter.trim()
      ? body.volunteerCharter.trim()
      : null
  }

  if (typeof body.hasOrgInsurance === "boolean") {
    updates.hasOrgInsurance = body.hasOrgInsurance
  }

  // « Qui est inscrit » (#1068): the value of the organisation's next new events; none changes now.
  if (typeof body.shiftRosterDefault === "boolean") {
    updates.shiftRosterDefault = body.shiftRosterDefault
  }

  // Headline of the public events page. Empty means "use the default" (Bénévoles).
  if ("publicTitle" in body) {
    const title = typeof body.publicTitle === "string" ? body.publicTitle.trim() : ""
    if (title.length === 0) {
      updates.publicTitle = null
    } else if (title.length < 2 || title.length > 100) {
      return NextResponse.json({ error: "Titre invalide (2–100 caractères, ou vide pour « Bénévoles »)." }, { status: 400 })
    } else {
      updates.publicTitle = title
    }
  }

  // Time zone of the organization's events (#344). Empty means the deployment default.
  if ("timeZone" in body) {
    const timeZone = typeof body.timeZone === "string" ? body.timeZone.trim() : ""
    if (!timeZone) {
      updates.timeZone = null
    } else if (!isValidTimeZone(timeZone)) {
      return NextResponse.json({ error: "Fuseau horaire inconnu." }, { status: 400 })
    } else {
      updates.timeZone = timeZone
    }
  }

  // Hourly rate for valuing volunteer work (#867): set with its currency, or cleared (empty) with it.
  if ("volunteerHourRate" in body) {
    const parsed = parseHourRateInput(body.volunteerHourRate, body.volunteerHourRateCurrency)
    if (parsed.kind === "error") return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 400 })
    if (parsed.kind === "clear") {
      updates.volunteerHourRateCents = null
      updates.volunteerHourRateCurrency = null
      updates.volunteerHourRateSetAt = null
    } else {
      updates.volunteerHourRateCents = parsed.cents
      updates.volunteerHourRateCurrency = parsed.currency
      updates.volunteerHourRateSetAt = new Date()
    }
  }

  // First-run checklist hidden (true) or shown again (false) for the whole organization (#369).
  if (typeof body.onboardingDismissed === "boolean") {
    updates.onboardingDismissedAt = body.onboardingDismissed ? new Date() : null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucune modification." }, { status: 400 })
  }

  const org = await prisma.$transaction(async (tx) => {
    if (oldSlug && updates.slug) {
      // If the org previously used the new slug as an alias, remove it first
      await tx.orgSlugHistory.deleteMany({ where: { slug: updates.slug, organizationId } })
      // Archive the current slug
      await tx.orgSlugHistory.create({ data: { slug: oldSlug, organizationId } })
    }
    return tx.organization.update({
      where: { id: organizationId },
      data: updates,
      select: { name: true, slug: true, volunteerCharter: true, hasOrgInsurance: true, shiftRosterDefault: true, publicTitle: true, timeZone: true, volunteerHourRateCents: true, volunteerHourRateCurrency: true, volunteerHourRateSetAt: true },
    })
  })

  const adminUrl = oldSlug ? `${orgBaseUrl(org.slug)}/admin/settings/admins` : null
  return NextResponse.json({ name: org.name, slug: org.slug, publicTitle: org.publicTitle, timeZone: org.timeZone, shiftRosterDefault: org.shiftRosterDefault,
    volunteerHourRateCents: org.volunteerHourRateCents, volunteerHourRateCurrency: org.volunteerHourRateCurrency,
    volunteerHourRateSetAt: org.volunteerHourRateSetAt?.toISOString() ?? null,
    adminUrl,
  })
}
