import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId, session } = guard

  const { id } = await params

  const target = await db.adminUser.findFirst({ where: { id, organizationId } })
  if (!target) return NextResponse.json({ error: "Admin introuvable." }, { status: 404 })

  if (target.email === session.user?.email) {
    return NextResponse.json({ error: "Vous ne pouvez pas vous retirer vous-même." }, { status: 400 })
  }

  const activeCount = await db.adminUser.count({ where: { organizationId, isActive: true } })
  if (target.isActive && activeCount <= 1) {
    return NextResponse.json({ error: "Impossible de retirer le dernier admin actif." }, { status: 400 })
  }

  await prisma.adminUser.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
