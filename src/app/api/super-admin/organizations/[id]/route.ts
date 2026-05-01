import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { z } from "zod"

const patchSchema = z.object({
  active: z.boolean(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const org = await db.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          events: true,
          admins: true,
          members: true,
        },
      },
      admins: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
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
  const { db } = guard

  const { id } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const existing = await db.organization.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: "Organisation non trouvée" }, { status: 404 })

  const org = await db.organization.update({
    where: { id },
    data: { active: parsed.data.active },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      updatedAt: true,
    },
  })

  return NextResponse.json(org)
}
