import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { orgBaseUrl } from "@/lib/urls"

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

export async function PATCH(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { organizationId } = guard

  const body = await req.json().catch(() => ({}))
  const updates: { name?: string; slug?: string; volunteerCharter?: string | null; hasOrgInsurance?: boolean } = {}
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

    const current = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { slug: true },
    })
    if (!current) return NextResponse.json({ error: "Organisation introuvable." }, { status: 404 })

    if (current.slug !== slug) {
      const taken = await prisma.organization.findFirst({ where: { slug, id: { not: organizationId } } })
      if (taken) return NextResponse.json({ error: "Ce slug est déjà utilisé par une autre organisation." }, { status: 409 })

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
      select: { name: true, slug: true, volunteerCharter: true, hasOrgInsurance: true },
    })
  })

  const adminUrl = oldSlug ? `${orgBaseUrl(org.slug)}/admin/settings/admins` : null
  return NextResponse.json({ name: org.name, slug: org.slug, adminUrl })
}
