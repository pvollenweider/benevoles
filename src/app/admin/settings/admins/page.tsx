import { redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import AdminsManager from "@/components/admin/AdminsManager"

export const dynamic = "force-dynamic"

export default async function AdminsSettingsPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db, organizationId, session } = ctx

  const [admins, org] = await Promise.all([
    db.adminUser.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        setupTokenExpiresAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ])

  const currentEmail = session.user?.email ?? ""

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/events" className="text-sm text-blue-600">← Événements</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Équipe admin</h1>
        {org && <p className="text-sm text-gray-500">{org.name}</p>}
      </div>

      <AdminsManager
        initialAdmins={admins.map((a) => ({
          id: a.id,
          name: a.name,
          email: a.email,
          role: a.role,
          isActive: a.isActive,
          createdAt: a.createdAt.toISOString(),
          pending: !a.isActive && a.setupTokenExpiresAt != null,
        }))}
        currentEmail={currentEmail}
      />
    </div>
  )
}
