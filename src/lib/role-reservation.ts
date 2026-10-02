// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Roles reserved to members with a tag (#470), e.g. « Sécurité » for members tagged `sécurité`.
 * Public sign-up has no account, so the only proof of who someone is is a valid member invitation
 * link: a reserved role is bookable only through the invitation of a member carrying one of the
 * required tags, read by the server at sign-up. Without the link, the role is visible and says it
 * is reserved; the public page never shows which tags. Pure.
 */

const key = (t: string) => t.trim().toLocaleLowerCase("fr")

/** Required tags per role, from all its shifts (they share one value; any shift's tags count). */
export function reservedRoles(shifts: { roleName: string; reservedTags?: string[] | null }[]): Map<string, string[]> {
  const out = new Map<string, Map<string, string>>()
  for (const s of shifts) {
    for (const t of s.reservedTags ?? []) {
      if (!t.trim()) continue
      const tags = out.get(s.roleName) ?? new Map<string, string>()
      if (!tags.has(key(t))) tags.set(key(t), t.trim())
      out.set(s.roleName, tags)
    }
  }
  return new Map([...out].map(([role, tags]) => [role, [...tags.values()]]))
}

/** Whether a member with these tags may take a role requiring one of `required` (case-insensitive). */
export function memberMayTake(memberTags: string[], required: string[]): boolean {
  if (required.length === 0) return true
  const mine = new Set(memberTags.map(key))
  return required.some((t) => mine.has(key(t)))
}

/** The reserved roles of the event this member may take. */
export function allowedReservedRoles(reserved: Map<string, string[]>, memberTags: string[]): string[] {
  return [...reserved].filter(([, tags]) => memberMayTake(memberTags, tags)).map(([role]) => role)
}

export const RESERVED_LABEL = "réservé à certains membres"

export function reservationRefusal(roleName: string, withInvite: boolean): string {
  return withInvite
    ? `Le poste « ${roleName} » est réservé à certains membres, et ton invitation n'y donne pas accès.`
    : `Le poste « ${roleName} » est réservé aux membres invités : utilise le lien personnel reçu par email.`
}

/** Tags typed by the organiser (« sécurité, secouriste ») → a clean list, at most 10. */
export function parseTagList(input: string): string[] {
  const seen = new Map<string, string>()
  for (const t of input.split(/[,;]/)) {
    const v = t.trim().slice(0, 40)
    if (v && !seen.has(key(v))) seen.set(key(v), v)
  }
  return [...seen.values()].slice(0, 10)
}
