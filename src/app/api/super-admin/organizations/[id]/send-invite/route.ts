import { NextResponse } from "next/server"
import { requireSuperAdmin } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin()
  if (guard instanceof NextResponse) return guard

  const { id } = await params

  const org = await prisma.organization.findUnique({
    where: { id },
    select: {
      name: true,
      admins: {
        where: { isActive: false, setupToken: { not: null } },
        select: { email: true, name: true, setupToken: true },
        take: 1,
      },
    },
  })

  if (!org) return NextResponse.json({ error: "Organisation introuvable." }, { status: 404 })

  const admin = org.admins[0]
  if (!admin) return NextResponse.json({ error: "Aucun compte en attente d'activation." }, { status: 404 })

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")
  const inviteUrl = `${appUrl}/admin/accept-invite?token=${admin.setupToken}`

  const result = await sendNotification({
    kind: "admin_invite",
    recipient: { email: admin.email, name: admin.name },
    data: { adminName: admin.name, organizationName: org.name, inviteUrl },
  })

  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 500 })

  return NextResponse.json({ ok: true })
}
