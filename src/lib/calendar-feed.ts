// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The volunteer's calendar subscription (#961): an address that calendar apps (Apple, Google,
 * Outlook, Thunderbird…) fetch again on their own, so a moved, cancelled or new shift reaches the
 * calendar without the volunteer doing anything. Server only (node:crypto).
 *
 * The address does NOT carry the personal token. Calendar services keep the address, fetch it
 * from their own servers for years and show it in their settings, and people share calendars:
 * the personal token also withdraws shifts, edits answers and the roster choice, so it must not
 * travel there. The feed has its own read-only token, derived from the personal link:
 *
 *   <registrationId>-1<s><h>
 *     1  format version
 *     s  16 hex: HMAC(key, "id" + registrationId), proof that the app made this address, checked
 *        before any database read;
 *     h  32 hex: HMAC(key, "link" + registrationId + editTokenHash), ties the address to the
 *        personal link as it is now.
 *
 * Nothing is stored. Revoking the personal link (a new link, link regeneration #542, member
 * erasure, member merge, past-event anonymisation: all give the registration a new
 * editTokenHash) revokes its calendar address too. The key derives from AUTH_SECRET, already a
 * required secret: rotating AUTH_SECRET revokes every calendar address, as it signs out everyone.
 *
 * A well-signed address whose link was revoked answers 410 and is not counted as a failed lookup:
 * calendar servers keep polling a dead subscription from shared addresses (Google's fetchers),
 * and counting those would end up blocking every volunteer's feed fetched from there. Only an
 * address the app never made counts (recordTokenMiss, "calendar" family).
 */
import { createHmac } from "node:crypto"
import { safeEqual } from "./safe-equal"
import { pickShiftInfo, shiftInfoText, type ShiftInfo } from "./shift-info"
import type { IcsShift } from "./ics"

const VERSION = "1"
const S_LEN = 16
const H_LEN = 32
const TOKEN_RE = new RegExp(`^([a-z0-9]{8,64})-${VERSION}([0-9a-f]{${S_LEN}})([0-9a-f]{${H_LEN}})$`)

/** The calendar key, derived from AUTH_SECRET so that it is never the session key itself. */
export function calendarFeedKey(authSecret: string): Buffer {
  return createHmac("sha256", authSecret).update("benevol calendar feed key v1").digest()
}

/**
 * The key from this server's AUTH_SECRET, or null when it is missing (the app refuses to start
 * without it, src/lib/env.ts; null only in tests and scripts).
 */
export function calendarFeedKeyFromEnv(environment: Record<string, string | undefined> = process.env): Buffer | null {
  const secret = environment.AUTH_SECRET
  return secret && secret.length >= 32 ? calendarFeedKey(secret) : null
}

const mac = (key: Buffer, ...parts: string[]) => createHmac("sha256", key).update(parts.join("\0")).digest("hex")
const idProof = (key: Buffer, registrationId: string) => mac(key, "id", registrationId).slice(0, S_LEN)
const linkProof = (key: Buffer, registrationId: string, editTokenHash: string) => mac(key, "link", registrationId, editTokenHash).slice(0, H_LEN)

/** The calendar token of a registration's personal link. */
export function calendarFeedToken(registrationId: string, editTokenHash: string, key: Buffer): string {
  return `${registrationId}-${VERSION}${idProof(key, registrationId)}${linkProof(key, registrationId, editTokenHash)}`
}

export type ParsedFeedToken = { registrationId: string; linkProof: string }

/**
 * The registration a calendar token names, when the app made it (format and id proof right);
 * null for anything else. Says nothing yet about whether the link is still valid.
 */
export function parseCalendarFeedToken(raw: string, key: Buffer): ParsedFeedToken | null {
  const token = raw.endsWith(".ics") ? raw.slice(0, -4) : raw
  const m = TOKEN_RE.exec(token)
  if (!m) return null
  const [, registrationId, s, h] = m
  if (!safeEqual(s, idProof(key, registrationId))) return null
  return { registrationId, linkProof: h }
}

/** Whether a parsed token still matches the registration's current personal link. */
export function calendarFeedLinkValid(parsed: ParsedFeedToken, editTokenHash: string, key: Buffer): boolean {
  return safeEqual(parsed.linkProof, linkProof(key, parsed.registrationId, editTokenHash))
}

/** Refresh hint of the feed, in hours (REFRESH-INTERVAL): calendar apps decide for themselves in the end. */
export const FEED_REFRESH_HOURS = 6

/** Path of the feed, under the personal-link family (no access log, scrubbed from error reports). */
export const calendarFeedPath = (token: string) => `/api/public/registrations/${token}/calendar.ics`

/** The two forms of the address: https (to paste in Google Calendar) and webcal (opens the calendar app). */
export function calendarFeedUrls(baseUrl: string, token: string): { https: string; webcal: string } {
  const https = `${baseUrl.replace(/\/$/, "")}${calendarFeedPath(token)}`
  return { https, webcal: https.replace(/^https?:/, "webcal:") }
}

const REVISION_EPOCH = Date.UTC(2025, 0, 1)

/**
 * SEQUENCE and LAST-MODIFIED of an entry without a stored revision counter: the last change among
 * what the entry is made of (registration, shift, event, organisation for its time zone), in
 * seconds since 2025. It only grows, so a calendar sees each change as newer; a change that does
 * not show (a reminder sent) raises it too, which is harmless.
 */
export function icsRevision(dates: (Date | null | undefined)[]): { sequence: number; lastModified: Date } {
  const ms = Math.max(REVISION_EPOCH, ...dates.filter((d): d is Date => !!d).map((d) => d.getTime()))
  return { sequence: Math.floor((ms - REVISION_EPOCH) / 1000), lastModified: new Date(Math.floor(ms / 1000) * 1000) }
}

type ShiftRow = ShiftInfo & {
  roleName: string
  label: string
  date: Date
  startTime: string
  endTime: string
  updatedAt?: Date
}
type EventRow = { title: string; location?: string | null; latitude?: number | null; longitude?: number | null; updatedAt?: Date }

/**
 * Calendar entries of confirmed registrations, the same for the one-off file and the feed: role,
 * times, place, practical lines. `url` is what the entry links to (the personal page in the file
 * the volunteer downloads, never in the feed).
 */
export function icsShiftsFor(
  regs: { id: string; updatedAt?: Date; shift: ShiftRow }[],
  event: EventRow,
  opts: { url: string; orgUpdatedAt?: Date | null },
): IcsShift[] {
  return regs.map((r) => {
    const info = pickShiftInfo(r.shift, event)
    const { sequence, lastModified } = icsRevision([r.updatedAt, r.shift.updatedAt, event.updatedAt, opts.orgUpdatedAt])
    return {
      registrationId: r.id,
      eventTitle: event.title,
      roleName: r.shift.roleName,
      label: r.shift.label,
      date: r.shift.date,
      startTime: r.shift.startTime,
      endTime: r.shift.endTime,
      location: r.shift.locationDetails?.trim() || event.location,
      latitude: info.latitude,
      longitude: info.longitude,
      details: shiftInfoText(info),
      url: opts.url,
      sequence,
      lastModified,
    }
  })
}
