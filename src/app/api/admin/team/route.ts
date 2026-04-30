import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"

/**
 * GET — list of admins of the caller's organization. Used by the
 * /admin/settings/members page to render the team table.
 */
export async function GET() {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { organizationId } = guard

  const admins = await prisma.adminUser.findMany({
    where: { organizationId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(admins)
}
