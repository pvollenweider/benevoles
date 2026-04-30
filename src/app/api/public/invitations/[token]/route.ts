import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"

const acceptSchema = z.object({
  name: z.string().min(1).max(120),
  password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères").max(200),
})

/**
 * GET — preview the invitation (used by the acceptance page to show
 * the org name and validate the token before showing the form).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const invitation = await prisma.adminInvitation.findUnique({
    where: { token },
    include: { organization: { select: { name: true, isActive: true } } },
  })

  if (!invitation) return NextResponse.json({ error: "Lien invalide" }, { status: 404 })
  if (invitation.acceptedAt) return NextResponse.json({ error: "Invitation déjà acceptée" }, { status: 410 })
  if (invitation.revokedAt) return NextResponse.json({ error: "Invitation révoquée" }, { status: 410 })
  if (invitation.expiresAt < new Date()) return NextResponse.json({ error: "Invitation expirée" }, { status: 410 })
  if (!invitation.organization.isActive) return NextResponse.json({ error: "Organisation désactivée" }, { status: 410 })

  return NextResponse.json({
    email: invitation.email,
    organizationName: invitation.organization.name,
  })
}

/**
 * POST — accept: creates the AdminUser, marks the invitation as
 * accepted. The acceptance page redirects to /admin/login afterwards.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json()
  const parsed = acceptSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const invitation = await prisma.adminInvitation.findUnique({
    where: { token },
    include: { organization: { select: { isActive: true } } },
  })

  if (!invitation) return NextResponse.json({ error: "Lien invalide" }, { status: 404 })
  if (invitation.acceptedAt) return NextResponse.json({ error: "Invitation déjà acceptée" }, { status: 410 })
  if (invitation.revokedAt) return NextResponse.json({ error: "Invitation révoquée" }, { status: 410 })
  if (invitation.expiresAt < new Date()) return NextResponse.json({ error: "Invitation expirée" }, { status: 410 })
  if (!invitation.organization.isActive) return NextResponse.json({ error: "Organisation désactivée" }, { status: 410 })

  // Reject if an account with this email already exists (we don't want
  // to silently merge a super_admin or another org's admin).
  const existing = await prisma.adminUser.findUnique({ where: { email: invitation.email } })
  if (existing) {
    return NextResponse.json(
      { error: "Un compte existe déjà avec cet email. Connecte-toi puis demande à un super admin de t'attribuer l'organisation." },
      { status: 409 },
    )
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12)

  await prisma.$transaction([
    prisma.adminUser.create({
      data: {
        email: invitation.email,
        name: parsed.data.name,
        passwordHash,
        role: invitation.role,
        organizationId: invitation.organizationId,
      },
    }),
    prisma.adminInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    }),
  ])

  return NextResponse.json({ success: true, email: invitation.email })
}
