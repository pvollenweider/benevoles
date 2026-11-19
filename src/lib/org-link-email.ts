// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The organisation-wide personal link in the general emails (#1429, lot B).
 *
 * Confirmation, reminders, targeted messages and the other general management emails carry one
 * button, « Mes inscriptions », pointing to /mes-inscriptions/<token> instead of the event's
 * personal page. The token is issued lazily when the email is built, inside the caller's
 * transaction, and only once per volunteer even when several general emails of that volunteer are
 * queued together: `ensureOrgLink` returns the existing token without writing.
 *
 * Event-specific action emails (waitlist offer, swaps, availability, approval flows, event link
 * re-sends) are deliberately not listed: their link is bound to the action on one event and stays
 * as it is. A targeted message to the waitlist keeps no personal link, as before: the event page
 * it replaces never opened a waitlist entry.
 *
 * The token travels like the event token: in the outbox payload, sealed with the rest of it when
 * TOKEN_ENCRYPTION_KEY is set. `outboxRecipientVerdict` refuses to send an email whose token is no
 * longer the volunteer's current one (renewal, address correction, merge, erasure). The legacy
 * reminders send directly, without the outbox, so they issue and re-read the address and the token
 * in one transaction instead (`readLegacyReminderRecipient`).
 */

import { ensureOrgLinkForEmail, ensureOrgLinkForRecipient, type OrgLinkEmailDb, type OrgLinkRecipientDb } from "./org-link"
import { memberAddressChanged } from "./outbox-address-changed-reason"
import type { NotificationPayload } from "./notifications/types"

/** Every volunteer-facing email whose main action is managing all one's registrations. */
export const ORG_LINK_EMAIL_KINDS = [
  "registration_confirmation",
  "registration_added_by_organizer",
  "registration_restored",
  "registration_removed",
  "reminder_j2",
  "reminder_j1",
  "reminder_dd",
  "reminder_rule",
  "manual_reminder",
  "targeted_message",
  "shift_modified",
] as const

const ORG_LINK_EMAIL_KIND_SET: ReadonlySet<string> = new Set(ORG_LINK_EMAIL_KINDS)

/**
 * Whether this payload should get the organisation link (#1429, lot B). A payload without a
 * member or an organisation cannot have one; a targeted message to the waitlist has no personal
 * page at all, so it keeps no link.
 */
export function isOrgLinkEmail(payload: NotificationPayload): boolean {
  if (!ORG_LINK_EMAIL_KIND_SET.has(payload.kind)) return false
  if (!payload.volunteerId || !payload.organizationId) return false
  if (!payload.recipient?.email?.trim()) return false
  const data = payload.data ?? {}
  if (typeof data.orgToken === "string" && data.orgToken) return false
  if (payload.kind === "targeted_message" && !data.editToken) return false
  return true
}

const pairKey = (payload: NotificationPayload) => `${payload.organizationId}\u0000${payload.volunteerId}`

/** The delegate `ensureOrgLinkForEmail` needs, when the caller's client has it. */
function hasOrgLinkDelegate(db: unknown): db is OrgLinkEmailDb {
  const volunteer = (db as { volunteer?: { findFirst?: unknown; updateMany?: unknown } } | null | undefined)?.volunteer
  return !!volunteer && typeof volunteer.findFirst === "function" && typeof volunteer.updateMany === "function"
}

/**
 * Adds `orgToken` (and the organisation's name, if the payload doesn't carry it yet) to the
 * general emails of `payloads`, issuing one link per volunteer even when several emails are in
 * the same batch. Returns the payloads unchanged when the client has no volunteer delegate (a
 * preview, a test double) or no link can be issued.
 */
export async function attachOrgLinks(payloads: NotificationPayload[], db: unknown): Promise<NotificationPayload[]> {
  const pending = payloads.filter(isOrgLinkEmail)
  if (pending.length === 0 || !hasOrgLinkDelegate(db)) return payloads

  // One ensure per volunteer and organisation: the second email of the same person reuses the
  // token the first one just issued instead of writing a second one.
  const groups = new Map<string, { volunteerId: string; organizationId: string; organizationName?: string }>()
  for (const payload of pending) {
    const key = pairKey(payload)
    const name = typeof payload.data.organizationName === "string" ? payload.data.organizationName : undefined
    const group = groups.get(key)
    if (!group) groups.set(key, { volunteerId: payload.volunteerId!, organizationId: payload.organizationId!, organizationName: name })
    else if (!group.organizationName && name) group.organizationName = name
  }
  const links = new Map<string, { token: string; organizationName: string }>()
  for (const [key, group] of groups) {
    const link = await ensureOrgLinkForEmail(db, group.volunteerId, group.organizationId, new Date(), group.organizationName)
    if (link) links.set(key, { token: link.token, organizationName: link.organizationName })
  }
  if (links.size === 0) return payloads

  return payloads.map((payload) => {
    if (!isOrgLinkEmail(payload)) return payload
    const link = links.get(pairKey(payload))
    if (!link) return payload
    return {
      ...payload,
      data: {
        ...payload.data,
        orgToken: link.token,
        organizationName: payload.data.organizationName ?? link.organizationName,
      },
    }
  })
}

/** The transaction the legacy reminder needs: a row lock, the lazy issue and a re-read. */
type LegacyReminderTx = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>
  volunteer: {
    findFirst(args: { where: Record<string, unknown>; select: Record<string, unknown> }): Promise<unknown>
    updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>
  }
}

/** The slice of the client (or a transaction) `readLegacyReminderRecipient` needs. */
export type LegacyReminderDb = {
  $transaction<T>(fn: (tx: LegacyReminderTx) => Promise<T>): Promise<T>
}

/** Who a legacy reminder may write to, read now, with the token current now. */
export type LegacyReminderRecipient = { email: string; orgToken: string | null }

/**
 * The recipient of a legacy reminder (#1429, lot B), read in one transaction with its token.
 *
 * The reminder rows were selected earlier and carry the address read at that time. Issuing the
 * organisation-wide link for that stale address and sending it there would deliver a valid link
 * to an inbox the member just left. Here the token is issued and the member re-read in one
 * transaction: when the address is no longer the selected one, nothing is returned and the
 * reminder is skipped (its group is given back, so a later run writes to the current address).
 *
 * The Volunteer row is locked first, like an address correction, a merge or an erasure does, so
 * none of them can commit between the issue and the re-read. One that commits after this
 * transaction rotates the token, so the email in flight can only carry a link that no longer
 * works — never a working link to the old inbox.
 */
export async function readLegacyReminderRecipient(
  db: LegacyReminderDb,
  input: {
    volunteerId: string
    organizationId: string
    /** The address read when the reminder was selected; null or blank means none. */
    selectedEmail: string | null | undefined
    /** The organisation's name, already on the reminder's event: skips a second read. */
    organizationName: string
    now?: Date
  },
): Promise<LegacyReminderRecipient | null> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Volunteer" WHERE id = ${input.volunteerId} AND "organizationId" = ${input.organizationId} FOR UPDATE`
    // Issue (or read) the link, then re-read the address and the token actually stored, together.
    const current = await ensureOrgLinkForRecipient(
      tx as unknown as OrgLinkRecipientDb,
      input.volunteerId,
      input.organizationId,
      input.now ?? new Date(),
      input.organizationName,
    )
    if (!current?.email?.trim()) return null
    if (memberAddressChanged(input.selectedEmail, current)) return null
    return { email: current.email, orgToken: current.link?.token ?? null }
  })
}
