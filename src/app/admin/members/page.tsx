import { redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import MembersManager from "@/components/admin/MembersManager"
import { defaultPeriod, lastParticipation, localToday, pastEntries, splitMinutes, volunteerHourEntries } from "@/lib/volunteer-hours"
import { orgTimeZone } from "@/lib/time-zone"
import { SEARCH_MAX_LENGTH } from "@/lib/admin-search"
import { loadAddressStatuses } from "@/lib/delivery-outcomes-data"
import { serializeAddressStatus } from "@/lib/address-status"
import { addressHash } from "@/lib/notifications/smtp-outcome"
import { env } from "@/lib/env"

export const dynamic = "force-dynamic"

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; verify?: string | string[]; edit?: string | string[] }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { db } = ctx
  const { q, verify, edit } = await searchParams
  const initialSearch = (Array.isArray(q) ? q[0] : q)?.slice(0, SEARCH_MAX_LENGTH).trim() || undefined
  // From the dashboard's attention item (#599): land on the members list with the filter already on.
  const initialAddressToVerify = (Array.isArray(verify) ? verify[0] : verify) === "1"
  // From the member activity page's « Modifier l'adresse » action (#599): open the edit form at once.
  const initialEditId = (Array.isArray(edit) ? edit[0] : edit) || undefined

  const [volunteers, allTags, org] = await Promise.all([
    db.volunteer.findMany({
      orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      include: {
        // Active registrations on a shift that was never cancelled only (#557, same rule as the
        // certificate, #556) — one query for every member, then pure aggregation below, so this
        // page stays one round trip regardless of how many registrations an org has. Across every
        // event of the org, not one at a time: this is an admin-only recognition figure ("who's
        // given the org the most time"), deliberately kept off the volunteer-facing PDF export
        // where a per-event ranking would read as a competition between people who showed up to help.
        registrations: {
          where: { status: "active" },
          select: {
            id: true, status: true, checkedInAt: true,
            shift: { select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, status: true } },
            event: { select: { id: true, title: true } },
          },
        },
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
  const today = localToday(new Date(), timeZone)
  const addressStatuses = await loadAddressStatuses(
    ctx.organizationId,
    volunteers.map((v) => ({ id: v.id, addressHash: v.email ? addressHash(v.email, env.AUTH_SECRET) : null })),
  )

  return (
    <MembersManager
      initialMembers={volunteers.map((v) => {
        const entries = volunteerHourEntries(v.registrations, timeZone)
        const past = pastEntries(entries, today)
        // « Heures planifiées » (#557): past confirmed shifts only, real local instants — distinct
        // from « Heures attestées » (a recorded presence among those same past shifts); the two
        // never overlap. A future confirmed shift isn't "planned hours given" yet, it just hasn't
        // happened (the bug tracked separately as #571, fixed here by scoping to the past).
        const { plannedMinutes, attestedMinutes } = splitMinutes(past)
        const { lastShiftDate, lastPresenceDate } = lastParticipation(past)
        return {
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
          hoursTotal: plannedMinutes / 60,
          hoursAttested: attestedMinutes / 60,
          lastShiftDate,
          lastPresenceDate,
          addressStatus: serializeAddressStatus(addressStatuses.get(v.id) ?? { kind: "ok" }),
        }
      })}
      allTags={allTags}
      initialSearch={initialSearch}
      initialAddressToVerify={initialAddressToVerify}
      initialEditId={initialEditId}
      defaultHoursPeriod={defaultPeriod(new Date(), timeZone)}
    />
  )
}
