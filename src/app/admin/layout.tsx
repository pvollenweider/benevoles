import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import AdminNav from "@/components/admin/AdminNav"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  if (!session) {
    return <>{children}</>
  }

  let orgName: string | undefined
  let organizationId = session.user?.organizationId
  if (!organizationId && session.user?.role === "super_admin") {
    const fallback = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })
    if (fallback) organizationId = fallback.id
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
      <AdminNav userName={session.user?.name ?? "Admin"} role={session.user?.role} orgName={orgName} />
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
