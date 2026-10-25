// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { randomInt } from "node:crypto"
import { z } from "zod"
import { LIVE_STATUSES, isUniqueViolation } from "@/lib/registration-capacity"
import { eventPublicUrl } from "@/lib/urls"
import { publicShifts } from "@/lib/role-assignment"
import {
  type AdminGroupLink,
  GROUP_LINK_NAME_MAX,
  GROUP_LINK_NAME_REQUIRED,
  GROUP_LINK_NAME_TOO_LONG,
  GROUP_LINK_ROLES_REQUIRED,
  cleanRoleNames,
  generateGroupCode,
  groupLinkStats,
  groupLinkUrl,
  missingRoles,
  sameGroupName,
} from "@/lib/group-links"

/**
 * Server side of the share links per group (#947): validation of the admin form, the event's live
 * roles, the unique code and the shape the admin list reads. Reads go through the caller's
 * org-scoped client (`db`), never the raw one.
 */

export const groupLinkInput = z.object({
  name: z.string().trim().min(1, GROUP_LINK_NAME_REQUIRED).max(GROUP_LINK_NAME_MAX, GROUP_LINK_NAME_TOO_LONG),
  roleNames: z.array(z.string().max(100)).max(100),
  hideFull: z.boolean().optional().default(false),
})

// Not `.partial()` of the above: its default would turn an absent hideFull into `false`.
export const groupLinkPatch = z.object({
  name: groupLinkInput.shape.name.optional(),
  roleNames: groupLinkInput.shape.roleNames.optional(),
  hideFull: z.boolean().optional(),
})


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Whether another link of the event already has this name (#947). */
export async function nameTaken(db: Db, eventId: string, name: string, exceptId?: string): Promise<boolean> {
  const others: { id: string; name: string }[] = await db.eventGroupLink.findMany({ where: { eventId }, select: { id: true, name: true } })
  return others.some((o) => o.id !== exceptId && sameGroupName(o.name, name))
}

/**
 * Roles with at least one live (not cancelled) shift, in the planning's order: the roles a link may
 * show. A role assigned by the organisation only (#1145) is not one: the public page never shows it.
 */
export async function liveRoleNames(db: Db, eventId: string): Promise<string[]> {
  const shifts: { roleName: string; assignedOnly?: boolean }[] = await db.shift.findMany({
    where: { eventId, status: { not: "cancelled" } },
    select: { roleName: true, assignedOnly: true },
    orderBy: [{ displayOrder: "asc" }, { date: "asc" }, { startTime: "asc" }],
  })
  return [...new Set(publicShifts(shifts).map((s) => s.roleName))]
}

/**
 * The roles a link may keep: those ticked that exist on the planning. Returns the French refusal
 * when none is left (the form always offers live roles, so this is a stale form or a crafted call).
 */
export function checkRoles(requested: string[], live: string[]): { ok: true; roleNames: string[] } | { ok: false; error: string } {
  const liveSet = new Set(live)
  const roleNames = cleanRoleNames(requested).filter((n) => liveSet.has(n))
  if (roleNames.length === 0) return { ok: false, error: GROUP_LINK_ROLES_REQUIRED }
  return { ok: true, roleNames }
}

/**
 * Creates the link with a fresh random code. Codes are unique across the platform (unique index);
 * the scoped client can't see another organisation's codes, so a clash is detected by the insert
 * itself and retried with a new code.
 */
export async function createWithUniqueCode<T>(create: (code: string) => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await create(generateGroupCode(randomInt))
    } catch (e) {
      if (i >= 4 || !isUniqueViolation(e)) throw e
    }
  }
}

export type { AdminGroupLink }

type LinkRow = { id: string; code: string; name: string; roleNames: string[]; hideFull: boolean }

/** The admin list: each link with its URL, the roles no longer on the planning and its sign-ups. */
export async function loadAdminGroupLinks(db: Db, event: { id: string; slug: string; organization: { slug: string } }): Promise<AdminGroupLink[]> {
  const [links, live, regs]: [LinkRow[], string[], { groupLinkId: string | null; volunteerId: string }[]] = await Promise.all([
    db.eventGroupLink.findMany({ where: { eventId: event.id }, orderBy: [{ createdAt: "asc" }], select: { id: true, code: true, name: true, roleNames: true, hideFull: true } }),
    liveRoleNames(db, event.id),
    db.registration.findMany({
      where: { eventId: event.id, groupLinkId: { not: null }, status: { in: [...LIVE_STATUSES] } },
      select: { groupLinkId: true, volunteerId: true },
    }),
  ])
  const stats = groupLinkStats(regs)
  const base = eventPublicUrl(event.organization.slug, event.slug)
  return links.map((l) => toAdminGroupLink(l, base, live, stats.get(l.id)))
}

export function toAdminGroupLink(l: LinkRow, publicUrl: string, live: string[], stats?: { registrations: number; people: number }): AdminGroupLink {
  return {
    id: l.id,
    code: l.code,
    name: l.name,
    roleNames: l.roleNames,
    missingRoles: missingRoles(l.roleNames, live),
    hideFull: l.hideFull,
    url: groupLinkUrl(publicUrl, l.code),
    registrations: stats?.registrations ?? 0,
    people: stats?.people ?? 0,
  }
}

/** Non-personal log values (#947): the name, the roles as one readable string, the option. */
export function groupLinkLogValues(l: { name: string; roleNames: string[]; hideFull: boolean }) {
  return { name: l.name, roleNames: l.roleNames.join(", "), hideFull: l.hideFull }
}
