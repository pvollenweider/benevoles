import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { sendNotification } from "@/lib/notifications"
import { orgBaseUrl } from "@/lib/urls"
import { passwordSchema } from "@/lib/password"
import { rateLimit, getClientIp } from "@/lib/rate-limit"

const schema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
})

const INVALID_ERROR = "Lien invalide ou déjà utilisé."
const EXPIRED_ERROR = "Ce lien a expiré. Contactez votre administrateur."

/** Looks up an invite token and returns its status, without consuming it. */
async function checkToken(token: string) {
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

  if (!admin) return { ok: false as const, status: 404, error: INVALID_ERROR }
  if (admin.setupTokenExpiresAt && admin.setupTokenExpiresAt < new Date()) {
    return { ok: false as const, status: 410, error: EXPIRED_ERROR }
  }
  return { ok: true as const, admin }
}

/** Read-only precheck so the page can show an error before the person fills the form. */
export async function GET(req: Request) {
  const rl = rateLimit(getClientIp(req), "accept-invite-check", 30, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429 })
  }

  const token = new URL(req.url).searchParams.get("token") ?? ""
  if (!token) return NextResponse.json({ valid: false, error: INVALID_ERROR }, { status: 404 })

  const result = await checkToken(token)
  if (!result.ok) return NextResponse.json({ valid: false, error: result.error }, { status: result.status })
  return NextResponse.json({ valid: true })
}

export async function POST(req: Request) {
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { token, password } = parsed.data

  const result = await checkToken(token)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  const { admin } = result

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
