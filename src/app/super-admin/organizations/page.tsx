import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import OrgsManager from "@/components/super-admin/OrgsManager"

export const dynamic = "force-dynamic"

export default async function SuperAdminOrgsPage() {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      createdAt: true,
      _count: {
        select: {
          events: true,
          admins: true,
          volunteers: true,
        },
      },
    },
  })

  return (
    <OrgsManager
      initialOrgs={orgs.map((o) => ({
        ...o,
        createdAt: o.createdAt.toISOString(),
      }))}
    />
  )
}
