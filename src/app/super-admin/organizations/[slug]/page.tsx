import { redirect, notFound } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import OrgDetail from "@/components/super-admin/OrgDetail"

export const dynamic = "force-dynamic"

export default async function OrgDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session?.user) redirect("/admin/login")
  if (session.user.role !== "super_admin") redirect("/admin/login")

  const { slug } = await params

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          events: true,
          admins: true,
          volunteers: true,
        },
      },
      admins: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!org) notFound()

  return (
    <OrgDetail
      org={{
        ...org,
        createdAt: org.createdAt.toISOString(),
        updatedAt: org.updatedAt.toISOString(),
        admins: org.admins.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      }}
    />
  )
}
