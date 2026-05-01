import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"
import { randomBytes } from "crypto"
import bcrypt from "bcryptjs"
import { z } from "zod"

const postSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
})

function generateToken(): string {
  return randomBytes(32).toString("hex")
}

export async function GET() {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const admins = await db.adminUser.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      setupTokenExpiresAt: true,
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(
    admins.map((a) => ({
      ...a,
      pending: !a.isActive && a.setupTokenExpiresAt != null,
    })),
  )
}

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const body = await req.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { email, name } = parsed.data

  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: "Cet email est déjà utilisé." }, { status: 409 })

  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true } })
  if (!org) return NextResponse.json({ error: "Organisation introuvable." }, { status: 404 })

  const setupToken = generateToken()
  const setupTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const dummyHash = await bcrypt.hash(randomBytes(16).toString("hex"), 10)

  const admin = await prisma.adminUser.create({
    data: {
      organizationId,
      email,
      name,
      passwordHash: dummyHash,
      role: "admin",
      isActive: false,
      setupToken,
      setupTokenExpiresAt,
    },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, setupTokenExpiresAt: true },
  })

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")
  const inviteUrl = `${appUrl}/admin/accept-invite?token=${setupToken}`

  await sendNotification({
    kind: "admin_invite",
    recipient: { email, name },
    data: { adminName: name, organizationName: org.name, inviteUrl },
  })

  return NextResponse.json({ ...admin, pending: true, inviteUrl }, { status: 201 })
}
