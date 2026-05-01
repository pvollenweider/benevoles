import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"

export async function PATCH(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const { name } = await req.json().catch(() => ({}))
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
    return NextResponse.json({ error: "Nom invalide (2–100 caractères)." }, { status: 400 })
  }

  const org = await db.organization.update({
    where: { id: organizationId },
    data: { name: name.trim() },
    select: { name: true },
  })

  return NextResponse.json({ name: org.name })
}
