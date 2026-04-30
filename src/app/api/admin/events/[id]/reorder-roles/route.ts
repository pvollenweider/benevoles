import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const { id } = await params
  const { roleOrder } = await req.json()

  if (!Array.isArray(roleOrder)) {
    return NextResponse.json({ error: "roleOrder doit être un tableau" }, { status: 400 })
  }

  const owned = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await Promise.all(
    (roleOrder as string[]).map((roleName, index) =>
      prisma.shift.updateMany({
        where: { eventId: id, roleName, event: { organizationId } },
        data: { displayOrder: index * 100 },
      })
    )
  )

  return NextResponse.json({ success: true })
}
