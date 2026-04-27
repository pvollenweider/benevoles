import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * Public endpoint that resolves a MemberInvite token to the member info
 * needed to pre-fill the registration form. Validates that the invite
 * belongs to the same event as the requested slug.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const url = new URL(req.url)
  const expectedSlug = url.searchParams.get("slug")

  const invite = await prisma.memberInvite.findUnique({
    where: { token },
    include: {
      member: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          active: true,
        },
      },
      event: { select: { slug: true, organizationId: true } },
    },
  })

  if (!invite || !invite.member.active) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 })
  }

  // Defense: refuse to leak member info if the token does not match the
  // event the visitor is currently looking at.
  if (expectedSlug && invite.event.slug !== expectedSlug) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 })
  }

  return NextResponse.json({
    eventSlug: invite.event.slug,
    member: {
      firstName: invite.member.firstName,
      lastName: invite.member.lastName,
      email: invite.member.email ?? "",
      phone: invite.member.phone ?? "",
    },
  })
}
