import { redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import MembersManager from "@/components/admin/MembersManager"
import { plannedHours } from "@/lib/planned-hours"
import { orgTimeZone } from "@/lib/time-zone"
import { SEARCH_MAX_LENGTH } from "@/lib/admin-search"

export const dynamic = "force-dynamic"

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx
  const { q } = await searchParams
  const initialSearch = (Array.isArray(q) ? q[0] : q)?.slice(0, SEARCH_MAX_LENGTH).trim() || undefined

  const [volunteers, allTags, org] = await Promise.all([
    db.volunteer.findMany({
      orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      include: {
        // Active registrations only: a cancelled or still-pending (waiting/offered/requested)
        // shift isn't planned. Planned time, not time worked (#571): future shifts and no-shows
        // count. Across every event of the org, not one at a time: this is an
        // admin-only recognition figure ("who's given the org the most time"), deliberately kept
        // off the volunteer-facing PDF export where a per-event ranking would read as a
        // competition between people who showed up to help.
        registrations: { where: { status: "active" }, select: { status: true, shift: { select: { date: true, startTime: true, endTime: true } } } },
      },
    }),
    db.volunteer.findMany({ select: { tags: true } }).then((rows) => {
      const set = new Set<string>()
      for (const r of rows) for (const t of r.tags) set.add(t)
      return Array.from(set).sort()
    }),
    db.organization.findUnique({ where: { id: ctx.organizationId }, select: { timeZone: true } }),
  ])
  const timeZone = orgTimeZone(org)

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
        availabilityPeriods: v.availabilityPeriods,
        availabilityNote: v.availabilityNote,
        hoursTotal: plannedHours(v.registrations, timeZone),
      }))}
      allTags={allTags}
      initialSearch={initialSearch}
    />
  )
}
