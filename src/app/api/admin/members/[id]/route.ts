import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const patchSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
  active: z.boolean().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const owned = await db.member.findFirst({ where: { id }, select: { id: true, email: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const data = parsed.data
  const updateData: Record<string, unknown> = {}
  if (data.firstName !== undefined) updateData.firstName = data.firstName
  if (data.lastName !== undefined) updateData.lastName = data.lastName
  if (data.email !== undefined) updateData.email = data.email || null
  if (data.phone !== undefined) updateData.phone = data.phone || null
  if (data.tags !== undefined) updateData.tags = data.tags
  if (data.notes !== undefined) updateData.notes = data.notes || null
  if (data.active !== undefined) updateData.active = data.active

  const member = await prisma.member.update({ where: { id }, data: updateData })

  // Keep Volunteer in sync so exports reflect member edits
  const volEmail = owned.email
  if (volEmail && (data.firstName !== undefined || data.lastName !== undefined || data.phone !== undefined)) {
    const volUpdate: Record<string, unknown> = {}
    if (data.firstName !== undefined) volUpdate.firstName = data.firstName
    if (data.lastName !== undefined) volUpdate.lastName = data.lastName
    if (data.phone !== undefined) volUpdate.phone = data.phone || null
    prisma.volunteer.updateMany({ where: { email: volEmail }, data: volUpdate }).catch(() => {})
  }

  return NextResponse.json(member)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const owned = await db.member.findFirst({ where: { id }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // Soft delete: keep history (invites, future stats) but hide from rosters.
  await prisma.member.update({ where: { id }, data: { active: false } })
  return NextResponse.json({ success: true })
}
