import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"

export async function GET() {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const [slugHistory, publishedEventCount] = await Promise.all([
    db.orgSlugHistory.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: { slug: true, createdAt: true },
    }),
    db.event.count({ where: { organizationId, publicStatus: "published" } }),
  ])

  return NextResponse.json({ slugHistory, hasPublishedEvents: publishedEventCount > 0 })
}

export async function DELETE(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const body = await req.json().catch(() => ({}))
  if (typeof body.slug !== "string" || !body.slug.trim()) {
    return NextResponse.json({ error: "Slug manquant." }, { status: 400 })
  }

  await db.orgSlugHistory.deleteMany({
    where: { slug: body.slug.trim(), organizationId },
  })

  return NextResponse.json({ ok: true })
}
