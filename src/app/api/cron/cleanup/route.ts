import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function isAuthorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (expected) return auth === `Bearer ${expected}`
  const host = req.headers.get("host") ?? ""
  return host.startsWith("localhost") || host.startsWith("127.0.0.1")
}

export async function GET(req: Request) { return run(req) }
export async function POST(req: Request) { return run(req) }

async function run(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  // 30-day retention cutoff. We use updatedAt as a proxy for deactivation
  // time since neither Organization nor AdminUser tracks deactivatedAt.
  const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // --- 1. Inactive organizations ---
  // Cascades to: Event → Shift → Registration, Member, MemberInvite
  // AdminUser.organizationId is set to NULL (SetNull) — handled in step 3.
  const deletedOrgs = await prisma.organization.deleteMany({
    where: { active: false, updatedAt: { lt: cutoff30d } },
  })

  // --- 2. Orphan volunteers ---
  // Registrations were cascade-deleted with their organization's events above.
  // Volunteers have no direct org link so they must be cleaned up separately.
  const deletedVolunteers = await prisma.volunteer.deleteMany({
    where: { registrations: { none: {} } },
  })

  // --- 3. Deactivated admin users ---
  // Includes admins whose org was just deleted (organizationId = null after SetNull).
  const deletedAdmins = await prisma.adminUser.deleteMany({
    where: { isActive: false, updatedAt: { lt: cutoff30d } },
  })

  // --- 4. Expired tokens (housekeeping, not GDPR-critical) ---
  const clearedResetTokens = await prisma.adminUser.updateMany({
    where: {
      passwordResetExpiresAt: { lt: now },
      passwordResetToken: { not: null },
    },
    data: { passwordResetToken: null, passwordResetExpiresAt: null },
  })

  const clearedSetupTokens = await prisma.adminUser.updateMany({
    where: {
      setupTokenExpiresAt: { lt: now },
      setupToken: { not: null },
    },
    data: { setupToken: null, setupTokenExpiresAt: null },
  })

  return NextResponse.json({
    runAt: now.toISOString(),
    deleted: {
      organizations: deletedOrgs.count,
      volunteers: deletedVolunteers.count,
      adminUsers: deletedAdmins.count,
    },
    tokensCleaned: {
      passwordReset: clearedResetTokens.count,
      setup: clearedSetupTokens.count,
    },
  })
}
