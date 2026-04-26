import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })

  const { id } = await params
  const { roleOrder } = await req.json()

  if (!Array.isArray(roleOrder)) {
    return NextResponse.json({ error: "roleOrder doit être un tableau" }, { status: 400 })
  }

  await Promise.all(
    (roleOrder as string[]).map((roleName, index) =>
      prisma.shift.updateMany({
        where: { eventId: id, roleName },
        data: { displayOrder: index * 100 },
      })
    )
  )

  return NextResponse.json({ success: true })
}
