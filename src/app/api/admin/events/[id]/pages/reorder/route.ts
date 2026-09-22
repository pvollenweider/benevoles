import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const { pageIds } = await req.json()

  if (!Array.isArray(pageIds)) {
    return NextResponse.json({ error: "pageIds doit être un tableau" }, { status: 400 })
  }

  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await Promise.all(
    (pageIds as string[]).map((pageId, index) =>
      prisma.eventPage.updateMany({
        where: { id: pageId, eventId },
        data: { displayOrder: index },
      })
    )
  )

  return NextResponse.json({ success: true })
}
