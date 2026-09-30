// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"

/**
 * Targeted messages (#396): a subject and a plain-text message to the volunteers of an event,
 * a role, a shift, or the waitlist only. One email per person, whatever the number of their
 * shifts in the audience. No campaigns, segments or HTML editor.
 */

export const MESSAGE_SUBJECT_MAX = 120
export const MESSAGE_BODY_MAX = 2000
/** Messages per organization per hour, all events together. */
export const MESSAGE_RATE_LIMIT = 30

export const audienceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("event") }),
  z.object({ kind: z.literal("role"), roleName: z.string().min(1) }),
  z.object({ kind: z.literal("shift"), shiftId: z.string().min(1) }),
  z.object({ kind: z.literal("waitlist") }),
])
export type Audience = z.infer<typeof audienceSchema>

export const messageSchema = z.object({
  audience: audienceSchema,
  subject: z.string().trim().min(1, "L'objet est obligatoire.").max(MESSAGE_SUBJECT_MAX),
  message: z.string().trim().min(1, "Le message est obligatoire.").max(MESSAGE_BODY_MAX),
  /** Count and preview only, nothing sent. */
  dryRun: z.boolean().optional(),
  /** Also a push notification to the recipients' subscribed devices (#468); the email always goes. */
  push: z.boolean().optional(),
})

export const PUSH_TITLE_MAX = 60
export const PUSH_BODY_MAX = 120

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s)

/**
 * The push of a targeted message (#468): the subject as title, the first non-empty line of the
 * message as body, both short; the full text stays in the email.
 */
export function messagePushPayload(subject: string, message: string): { title: string; body: string } {
  const firstLine = message.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? ""
  return { title: clip(subject.trim(), PUSH_TITLE_MAX), body: clip(firstLine, PUSH_BODY_MAX) }
}
export type MessageInput = z.infer<typeof messageSchema>

export type RecipientRegistration = {
  volunteerId: string
  shiftId: string
  status: string
  volunteer: { firstName: string; lastName: string; email: string | null; active?: boolean }
  shift: { roleName: string; label: string; date: Date | string; startTime: string; endTime: string }
}

export type Recipient<R extends RecipientRegistration = RecipientRegistration> = {
  volunteerId: string
  volunteer: R["volunteer"]
  /** The registrations of this person in the audience, first one first. */
  registrations: R[]
}

/** Live statuses of the audience: confirmed people, or the waitlist (waiting and offered). */
function inAudience(r: RecipientRegistration, audience: Audience): boolean {
  switch (audience.kind) {
    case "event": return r.status === "active"
    case "role": return r.status === "active" && r.shift.roleName === audience.roleName
    case "shift": return r.status === "active" && r.shiftId === audience.shiftId
    case "waitlist": return r.status === "waiting" || r.status === "offered"
  }
}

/**
 * The people to write to, one entry per volunteer with an email, in the registrations' order.
 * Inactive members are still written to: they are registered on this event.
 */
export function selectRecipients<R extends RecipientRegistration>(registrations: R[], audience: Audience): Recipient<R>[] {
  const byVolunteer = new Map<string, Recipient<R>>()
  for (const r of registrations) {
    if (!inAudience(r, audience) || !r.volunteer.email) continue
    const entry = byVolunteer.get(r.volunteerId)
    if (entry) entry.registrations.push(r)
    else byVolunteer.set(r.volunteerId, { volunteerId: r.volunteerId, volunteer: r.volunteer, registrations: [r] })
  }
  return Array.from(byVolunteer.values())
}

/** « les 12 bénévoles inscrits », « les 3 bénévoles du poste Bar »… for confirmations and the log. */
export function audienceLabel(audience: Audience, shiftName?: string): string {
  switch (audience.kind) {
    case "event": return "tous les bénévoles inscrits"
    case "role": return `les bénévoles du poste « ${audience.roleName} »`
    case "shift": return `les bénévoles du créneau ${shiftName ?? audience.shiftId}`
    case "waitlist": return "les personnes en liste d'attente"
  }
}

/** Audience from the query string of the message page (`?shift=`, `?role=`, `?audience=waitlist`). */
export function audienceFromQuery(q: { shift?: string; role?: string; audience?: string }): Audience {
  if (q.shift) return { kind: "shift", shiftId: q.shift }
  if (q.role) return { kind: "role", roleName: q.role }
  if (q.audience === "waitlist") return { kind: "waitlist" }
  return { kind: "event" }
}
