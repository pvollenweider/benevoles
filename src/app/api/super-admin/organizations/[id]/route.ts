import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      admins: {
        select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      invitations: {
        where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { events: true, members: true } },
    },
  })

  if (!org) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  return NextResponse.json(org)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard

  const { id } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const org = await prisma.organization.update({ where: { id }, data: parsed.data })
  return NextResponse.json(org)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  // Soft delete: deactivate the org and all its admins. Hard delete is
  // gated behind an explicit super admin tool to avoid accidental data
  // loss (events + members + registrations cascade through Org FK).
  await prisma.$transaction([
    prisma.organization.update({ where: { id }, data: { isActive: false } }),
    prisma.adminUser.updateMany({ where: { organizationId: id }, data: { isActive: false } }),
  ])

  return NextResponse.json({ success: true })
}
