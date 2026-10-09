import { auth } from "@/auth"
// Reads the Organization row (name for the header), not a tenant-scoped model.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"
import { PENDING_ORG_WHERE } from "@/lib/org-review"
import { resolveSuperAdminOrg } from "@/lib/auth-guard"
import AdminNav from "@/components/admin/AdminNav"
import SkipLink, { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session) {
    return <>{children}</>
  }

  let orgName: string | undefined
  let pending = false
  let organizationId = session.user?.organizationId
  if (!organizationId && session.user?.role === "super_admin") {
    organizationId = await resolveSuperAdminOrg()
  }
  if (organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, publicationApprovedAt: true, outboundEmailApprovedAt: true },
    })
    orgName = org?.name
    // #810: a space created by self-service sign-up, awaiting the operator's validation.
    pending = !!org && (org.publicationApprovedAt === null || org.outboundEmailApprovedAt === null)
  }

  // The super admin's menu says how many spaces wait for a validation (#810), here as elsewhere.
  const pendingSpaces = session.user?.role === "super_admin" ? await prisma.organization.count({ where: PENDING_ORG_WHERE }) : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <SkipLink />
      <AdminNav userName={session.user?.name ?? "Admin"} role={session.user?.role} orgName={orgName} pendingSpaces={pendingSpaces} />
      {pending && (
        <section aria-label="Espace en attente de validation" className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <p className="max-w-5xl mx-auto text-sm text-amber-950">
            Votre espace est en attente de validation. Vous pouvez tout préparer dès maintenant ; la publication de vos événements et les emails à vos bénévoles seront possibles dès qu&apos;il sera activé. Vous recevrez un email.
          </p>
        </section>
      )}
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="max-w-5xl mx-auto px-4 py-6 focus:outline-none">{children}</main>
    </div>
  )
}
