import { redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import TeamManager from "@/components/admin/TeamManager"

export const dynamic = "force-dynamic"

function daysUntil(target: Date, now: number): number {
  return Math.max(0, Math.ceil((target.getTime() - now) / (24 * 3600 * 1000)))
}

export default async function TeamPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { organizationId, session } = ctx

  // SSR component, evaluated once per request — Date.now() is fine here.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  const [admins, invitations] = await Promise.all([
    prisma.adminUser.findMany({
      where: { organizationId },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.adminInvitation.findMany({
      where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      include: { inviter: { select: { name: true } } },
    }),
  ])

  return (
    <TeamManager
      currentUserId={session.user.id ?? ""}
      admins={admins.map((a) => ({
        id: a.id,
        email: a.email,
        name: a.name,
        role: a.role,
        isActive: a.isActive,
      }))}
      invitations={invitations.map((i) => ({
        id: i.id,
        email: i.email,
        daysLeft: daysUntil(i.expiresAt, now),
        inviterName: i.inviter.name,
      }))}
    />
  )
}
