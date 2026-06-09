import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

const patchSchema = z.object({
  active: z.boolean().optional(),
  name: z.string().min(2).max(100).optional(),
  slug: z.string().min(2).max(40).optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  const org = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { events: true, admins: true, volunteers: true } },
      admins: {
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!org) return NextResponse.json({ error: "Organisation non trouvée" }, { status: 404 })
  return NextResponse.json(org)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const existing = await prisma.organization.findUnique({ where: { id }, select: { id: true, slug: true } })
  if (!existing) return NextResponse.json({ error: "Organisation non trouvée" }, { status: 404 })

  const updates: { active?: boolean; name?: string; slug?: string } = {}
  let oldSlug: string | null = null

  if (parsed.data.active !== undefined) updates.active = parsed.data.active

  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim()

  if (parsed.data.slug !== undefined) {
    const slug = parsed.data.slug.trim().toLowerCase()
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json(
        { error: "Slug invalide (lettres minuscules, chiffres, tirets, sans tiret en début/fin)." },
        { status: 400 },
      )
    }
    if (slug !== existing.slug) {
      const taken = await prisma.organization.findFirst({ where: { slug, id: { not: id } } })
      if (taken) return NextResponse.json({ error: "Ce slug est déjà utilisé." }, { status: 409 })

      const inHistory = await prisma.orgSlugHistory.findFirst({
        where: { slug, organizationId: { not: id } },
      })
      if (inHistory) return NextResponse.json({ error: "Ce slug est réservé." }, { status: 409 })

      oldSlug = existing.slug
      updates.slug = slug
    }
  }

  const org = await prisma.$transaction(async (tx) => {
    if (oldSlug && updates.slug) {
      await tx.orgSlugHistory.deleteMany({ where: { slug: updates.slug, organizationId: id } })
      await tx.orgSlugHistory.create({ data: { slug: oldSlug, organizationId: id } })
    }
    return tx.organization.update({
      where: { id },
      data: updates,
      select: { id: true, name: true, slug: true, active: true, updatedAt: true },
    })
  })

  return NextResponse.json(org)
}
