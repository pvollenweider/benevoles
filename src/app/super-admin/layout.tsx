import { cookies } from "next/headers"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import AdminNav from "@/components/admin/AdminNav"
import SkipLink, { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"

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

  return (
    <div className="min-h-screen bg-gray-50">
      <SkipLink />
      <AdminNav userName={session.user?.name ?? "Super Admin"} role={session.user?.role} orgName={orgName} />
      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="max-w-5xl mx-auto px-4 py-6 focus:outline-none">{children}</main>
    </div>
  )
}
