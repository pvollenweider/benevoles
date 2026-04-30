import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import OrganizationsManager from "@/components/admin/OrganizationsManager"

export const dynamic = "force-dynamic"

export default async function OrganizationsPage() {
  const session = await auth()
  if (!session?.user || session.user.role !== "super_admin") redirect("/admin")

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { events: true, members: true, admins: true } },
    },
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Organisations</h1>
          <p className="text-sm text-gray-500">{orgs.length} organisation{orgs.length > 1 ? "s" : ""}</p>
        </div>
        <Link
          href="/super-admin/organizations/new"
          className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-purple-700"
        >
          + Nouvelle organisation
        </Link>
      </div>

      <OrganizationsManager
        orgs={orgs.map((o) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
          isActive: o.isActive,
          createdAt: o.createdAt.toISOString(),
          counts: o._count,
        }))}
      />
    </div>
  )
}
