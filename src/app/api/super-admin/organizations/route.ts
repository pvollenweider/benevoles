import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"
import { z } from "zod"

const slugRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

const createSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(2).max(60).regex(slugRegex, "Slug invalide (a-z, 0-9, tirets)"),
  inviteEmail: z.string().email().optional(),
})

export async function GET() {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { events: true, members: true, admins: true } },
    },
  })

  return NextResponse.json(orgs)
}

export async function POST(req: Request) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard
  const { session } = guard

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const existing = await prisma.organization.findUnique({ where: { slug: parsed.data.slug } })
  if (existing) {
    return NextResponse.json({ error: "Ce slug est déjà utilisé" }, { status: 409 })
  }

  const org = await prisma.organization.create({
    data: { name: parsed.data.name, slug: parsed.data.slug },
  })

  // Optional: send invitation to the first admin
  let invitation: { id: string; email: string; token: string } | null = null
  if (parsed.data.inviteEmail) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    const created = await prisma.adminInvitation.create({
      data: {
        email: parsed.data.inviteEmail,
        organizationId: org.id,
        invitedBy: session.user.id!,
        expiresAt,
      },
    })
    invitation = { id: created.id, email: created.email, token: created.token }

    await sendNotification({
      kind: "admin_invitation",
      recipient: { email: parsed.data.inviteEmail },
      data: {
        organizationName: org.name,
        inviterName: session.user.name ?? "Un super admin",
        token: created.token,
        expiresAt,
      },
    })
  }

  return NextResponse.json({ ...org, invitation }, { status: 201 })
}
