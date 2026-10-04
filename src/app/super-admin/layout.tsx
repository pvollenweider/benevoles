import { cookies } from "next/headers"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import AdminNav from "@/components/admin/AdminNav"
import SkipLink, { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"
import ReleaseBanner from "@/components/super-admin/ReleaseBanner"
import pkg from "../../../package.json"

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session) {
    return <>{children}</>
  }

  const cookieStore = await cookies()
  const saOrgId = cookieStore.get("sa-org-id")?.value
  let orgName: string | undefined
  if (saOrgId) {
    const org = await prisma.organization.findUnique({ where: { id: saOrgId }, select: { name: true } })
    orgName = org?.name
  }

  // Release banner (#612): super admins only, not organization admins or volunteers. The
  // component itself decides whether to show, from these props (see ReleaseBanner.tsx).
  let releaseState: { latestVersion: string | null; releaseUrl: string | null } | null = null
  let dismissedVersion: string | null = null
  if (session.user?.role === "super_admin" && session.user.id) {
    const [state, admin] = await Promise.all([
      prisma.releaseCheckState.findUnique({ where: { id: "singleton" } }),
      prisma.adminUser.findUnique({ where: { id: session.user.id }, select: { releaseBannerDismissedVersion: true } }),
    ])
    releaseState = { latestVersion: state?.latestVersion ?? null, releaseUrl: state?.releaseUrl ?? null }
    dismissedVersion = admin?.releaseBannerDismissedVersion ?? null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SkipLink />
      <AdminNav userName={session.user?.name ?? "Super Admin"} role={session.user?.role} orgName={orgName} />
      {releaseState && (
        <ReleaseBanner
          currentVersion={pkg.version}
          latestVersion={releaseState.latestVersion}
          releaseUrl={releaseState.releaseUrl}
          dismissedVersion={dismissedVersion}
        />
      )}
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="max-w-5xl mx-auto px-4 py-6 focus:outline-none">{children}</main>
    </div>
  )
}
