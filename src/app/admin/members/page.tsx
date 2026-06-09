import { redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import MembersManager from "@/components/admin/MembersManager"

export const dynamic = "force-dynamic"

export default async function MembersPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const [volunteers, allTags] = await Promise.all([
    db.volunteer.findMany({
      orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    }),
    db.volunteer.findMany({ select: { tags: true } }).then((rows) => {
      const set = new Set<string>()
      for (const r of rows) for (const t of r.tags) set.add(t)
      return Array.from(set).sort()
    }),
  ])

  return (
    <MembersManager
      initialMembers={volunteers.map((v) => ({
        id: v.id,
        firstName: v.firstName,
        lastName: v.lastName,
        email: v.email,
        phone: v.phone,
        tags: v.tags,
        active: v.active,
        notes: v.notes,
      }))}
      allTags={allTags}
    />
  )
}
