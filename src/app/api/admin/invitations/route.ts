import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { sendNotification } from "@/lib/notifications"
import { z } from "zod"

const createSchema = z.object({
  email: z.string().email(),
})

const INVITATION_TTL_DAYS = 7

export async function GET() {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { organizationId } = guard

  const invitations = await prisma.adminInvitation.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: { inviter: { select: { name: true, email: true } } },
  })

  return NextResponse.json(
    invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      acceptedAt: i.acceptedAt,
      revokedAt: i.revokedAt,
      inviterName: i.inviter.name,
    })),
  )
}

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { session, organizationId } = guard

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Refuse to invite an email that already has an admin account in this org.
  const existingAdmin = await prisma.adminUser.findFirst({
    where: { email: parsed.data.email, organizationId },
  })
  if (existingAdmin) {
    return NextResponse.json({ error: "Cet email est déjà admin de l'organisation" }, { status: 409 })
  }

  // Re-use a non-revoked, non-accepted invitation if it exists, refresh the
  // expiry. Otherwise create a fresh one.
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000)
  const existing = await prisma.adminInvitation.findUnique({
    where: { email_organizationId: { email: parsed.data.email, organizationId } },
  })

  let invitation
  if (existing && !existing.acceptedAt && !existing.revokedAt) {
    invitation = await prisma.adminInvitation.update({
      where: { id: existing.id },
      data: { expiresAt, invitedBy: session.user.id! },
    })
  } else if (existing) {
    // Reactivate a previously revoked / accepted one (rare but possible).
    invitation = await prisma.adminInvitation.update({
      where: { id: existing.id },
      data: { expiresAt, revokedAt: null, acceptedAt: null, invitedBy: session.user.id! },
    })
  } else {
    invitation = await prisma.adminInvitation.create({
      data: {
        email: parsed.data.email,
        organizationId,
        invitedBy: session.user.id!,
        expiresAt,
      },
    })
  }

  // Look up the org name for the email template (small extra query, fine).
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  })

  await sendNotification({
    kind: "admin_invitation",
    recipient: { email: parsed.data.email },
    data: {
      organizationName: org?.name ?? "votre organisation",
      inviterName: session.user.name ?? "Un administrateur",
      token: invitation.token,
      expiresAt,
    },
  })

  return NextResponse.json(
    { id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt },
    { status: 201 },
  )
}
