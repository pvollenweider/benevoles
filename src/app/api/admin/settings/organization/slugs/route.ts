import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { organizationId } = guard

  const [slugHistory, publishedEventCount] = await Promise.all([
    prisma.orgSlugHistory.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: { slug: true, createdAt: true },
    }),
    prisma.event.count({ where: { organizationId, publicStatus: "published" } }),
  ])

  return NextResponse.json({ slugHistory, hasPublishedEvents: publishedEventCount > 0 })
}

export async function DELETE(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { organizationId } = guard

  const body = await req.json().catch(() => ({}))
  if (typeof body.slug !== "string" || !body.slug.trim()) {
    return NextResponse.json({ error: "Slug manquant." }, { status: 400 })
  }

  await prisma.orgSlugHistory.deleteMany({
    where: { slug: body.slug.trim(), organizationId },
  })

  return NextResponse.json({ ok: true })
}
