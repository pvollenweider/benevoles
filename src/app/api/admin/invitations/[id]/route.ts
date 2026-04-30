import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { organizationId } = guard

  const { id } = await params

  const invitation = await prisma.adminInvitation.findFirst({
    where: { id, organizationId },
  })
  if (!invitation) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await prisma.adminInvitation.update({
    where: { id },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
