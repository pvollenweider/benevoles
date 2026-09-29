import { auth } from "@/auth"
// Reads the Organization row (name for the header), not a tenant-scoped model.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"
import { resolveSuperAdminOrg } from "@/lib/auth-guard"
import AdminNav from "@/components/admin/AdminNav"
import SkipLink, { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session) {
    return <>{children}</>
  }

  let orgName: string | undefined
  let organizationId = session.user?.organizationId
  if (!organizationId && session.user?.role === "super_admin") {
    organizationId = await resolveSuperAdminOrg()
  }
  if (organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    })
    orgName = org?.name
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SkipLink />
      <AdminNav userName={session.user?.name ?? "Admin"} role={session.user?.role} orgName={orgName} />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="max-w-5xl mx-auto px-4 py-6 focus:outline-none">{children}</main>
    </div>
  )
}
