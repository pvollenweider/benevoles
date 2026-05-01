import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { sendNotification } from "@/lib/notifications"
import { orgBaseUrl } from "@/lib/urls"
import { passwordSchema } from "@/lib/password"

const schema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
})

export async function POST(req: Request) {
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { token, password } = parsed.data

  const admin = await prisma.adminUser.findUnique({
    where: { setupToken: token },
    select: {
      id: true,
      name: true,
      email: true,
      setupTokenExpiresAt: true,
      isActive: true,
      organization: { select: { name: true, slug: true } },
    },
  })

  if (!admin) {
    return NextResponse.json({ error: "Lien invalide ou déjà utilisé." }, { status: 404 })
  }

  if (admin.setupTokenExpiresAt && admin.setupTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Ce lien a expiré. Contactez votre administrateur." }, { status: 410 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      passwordHash,
      isActive: true,
      setupToken: null,
      setupTokenExpiresAt: null,
    },
  })

  if (admin.organization) {
    const adminUrl = `${orgBaseUrl(admin.organization.slug)}/admin/events`
    sendNotification({
      kind: "admin_welcome",
      recipient: { email: admin.email, name: admin.name },
      data: {
        adminName: admin.name,
        organizationName: admin.organization.name,
        adminUrl,
      },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
