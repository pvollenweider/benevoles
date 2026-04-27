import { redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import MembersManager from "@/components/admin/MembersManager"

export const dynamic = "force-dynamic"

export default async function MembersPage() {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx

  const [members, allTags] = await Promise.all([
    db.member.findMany({
      orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    }),
    db.member.findMany({ select: { tags: true } }).then((rows) => {
      const set = new Set<string>()
      for (const r of rows) for (const t of r.tags) set.add(t)
      return Array.from(set).sort()
    }),
  ])

  return (
    <MembersManager
      initialMembers={members.map((m) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        phone: m.phone,
        tags: m.tags,
        active: m.active,
        notes: m.notes,
      }))}
      allTags={allTags}
    />
  )
}
