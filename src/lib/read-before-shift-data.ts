// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The pages to read before a shift (#1324), resolved from the database for emails. The link is
 * resolved at send time, never stored in the outbox payload: a page deleted (or detached, or an
 * event unpublished) before a queued email leaves therefore leaves no dead link. The rule itself
 * is pure (src/lib/event-page-postes.ts); this module only reads and shapes the payload.
 */

import { prisma } from "./prisma"
import { orgBaseUrl } from "./urls"
import { pagesToReadBeforeShift } from "./event-page-postes"
import type { NotificationPayload } from "./notifications/types"
import type { ReadBeforePage } from "./shift-info"

/** The pages attached to any of `roleNames` for a published event, absolute URLs, page order. */
export async function readBeforePagesForEvent(eventId: string, roleNames: string[]): Promise<ReadBeforePage[]> {
  if (roleNames.length === 0) return []
  const event = await prisma.event.findFirst({
    where: { id: eventId },
    select: {
      slug: true,
      publicStatus: true,
      organization: { select: { slug: true } },
      pages: {
        select: { slug: true, title: true, roleNames: true, displayOrder: true },
        orderBy: { displayOrder: "asc" },
      },
    },
  })
  // The page opens only once the event is published: never a link to a 404.
  if (!event || event.publicStatus !== "published") return []
  const base = orgBaseUrl(event.organization.slug)
  return pagesToReadBeforeShift(event.pages, roleNames.map((roleName) => ({ status: "active", roleName })))
    .map((page) => ({ title: page.title, url: `${base}/${event.slug}/${page.slug}` }))
}

/**
 * The same payload with the pages of its confirmed shifts on the first one, for the email
 * templates. A payload from a kind that carries no event or no shift is returned untouched; so
 * is a waiting-list confirmation (no shift info, no link).
 */
export async function withReadBeforeShiftPages(payload: NotificationPayload): Promise<NotificationPayload> {
  const data = (payload.data ?? {}) as Record<string, unknown>
  const eventId = typeof data.eventId === "string" ? data.eventId : null
  const shifts = Array.isArray(data.shifts) ? (data.shifts as Record<string, unknown>[]) : null
  if (!eventId || !shifts || shifts.length === 0) return payload
  const roleNames = [...new Set(shifts.map((s) => (typeof s.roleName === "string" ? s.roleName : "")).filter(Boolean))]
  if (roleNames.length === 0) return payload
  const pages = await readBeforePagesForEvent(eventId, roleNames)
  if (pages.length === 0) return payload
  return {
    ...payload,
    data: {
      ...data,
      shifts: shifts.map((shift, i) => (i === 0 ? { ...shift, readBefore: pages } : shift)),
    },
  }
}
