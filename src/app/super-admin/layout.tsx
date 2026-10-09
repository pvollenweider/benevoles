import { cookies } from "next/headers"
import Link from "next/link"
import { PENDING_ORG_WHERE } from "@/lib/org-review"
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

  // #810: spaces created by self-service sign-up waiting for a validation.
  const pendingCount = session.user?.role === "super_admin" ? await prisma.organization.count({ where: PENDING_ORG_WHERE }) : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <SkipLink />
      <AdminNav userName={session.user?.name ?? "Super Admin"} role={session.user?.role} orgName={orgName} pendingSpaces={pendingCount} />
      {pendingCount > 0 && (
        <section aria-label="Espaces en attente de validation" className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <p className="max-w-5xl mx-auto text-sm text-amber-950">
            {pendingCount} espace{pendingCount > 1 ? "s attendent" : " attend"} une validation.{" "}
            <Link href="/super-admin/organizations" className="font-medium underline underline-offset-2 hover:text-amber-800 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Voir les organisations</Link>
          </p>
        </section>
      )}
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
