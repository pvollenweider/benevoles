import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"

/**
 * DELETE — deactivate an admin in the caller's organization.
 * Refuses if the target is the caller themselves or the last active
 * admin of the org (to avoid locking everyone out).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { session, organizationId } = guard

  const { id } = await params

  if (id === session.user.id) {
    return NextResponse.json({ error: "Tu ne peux pas te désactiver toi-même" }, { status: 400 })
  }

  const target = await prisma.adminUser.findFirst({
    where: { id, organizationId },
  })
  if (!target) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const remainingActive = await prisma.adminUser.count({
    where: { organizationId, isActive: true, id: { not: id } },
  })
  if (remainingActive === 0) {
    return NextResponse.json(
      { error: "Impossible de désactiver le dernier admin de l'organisation" },
      { status: 400 },
    )
  }

  await prisma.adminUser.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ success: true })
}
