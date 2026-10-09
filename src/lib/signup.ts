// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"

/**
 * Self-service sign-up (#810, part 4b). Pure rules, shared by the form, the API routes and tests.
 *
 * The flow: the form (/inscription) creates a SignupRequest and emails a confirmation link; the
 * link opens a page with a « Confirmer » button (a link never acts by itself: mail scanners open
 * links); confirming creates the organisation **awaiting validation** (both grants null,
 * src/lib/org-approval.ts) and its owner account, inactive until the password is chosen on the
 * existing account activation page. The operator then validates (part 4c).
 *
 * Abuse: no CAPTCHA (accessibility, privacy). A hidden field (honeypot), a minimum fill time, the
 * request limits of the route (per IP), and the email limits (per recipient, global cap on
 * confirmation emails, src/lib/notifications/send-limits.ts). The answer is always the same,
 * so the form never tells whether an address is already known.
 */

export const SIGNUP_LINK_HOURS = 24
/** Below this, the form was filled by a script. */
export const SIGNUP_MIN_FILL_MS = 3000

/**
 * A name typed on a public form must not carry a link, an address or a line break: it is shown
 * to the operator and in the space, and must never become a way to pass a message or a link.
 */
const LINKISH = /(https?:\/\/|www\.|@|[\r\n]|\.(com|net|org|ch|fr|io|ru|xyz|info|biz)\b)/i
export const NO_LINK_MESSAGE = "Indiquez seulement un nom, sans lien ni adresse."

export const signupSchema = z.object({
  organizationName: z.string().trim().min(2, "Indiquez le nom de l'association (2 caractères au moins).").max(100, "Le nom de l'association est trop long (100 caractères au plus).").refine((v) => !LINKISH.test(v), NO_LINK_MESSAGE),
  contactName: z.string().trim().min(2, "Indiquez votre nom (2 caractères au moins).").max(100, "Votre nom est trop long (100 caractères au plus).").refine((v) => !LINKISH.test(v), NO_LINK_MESSAGE),
  email: z.string().trim().toLowerCase().email("Indiquez une adresse email valide, par exemple nom@exemple.org.").max(200),
  /** Honeypot: hidden from people, filled by naive scripts. */
  website: z.string().optional(),
  /** When the form was shown (ms since epoch), set by the page. */
  startedAt: z.number().int().optional(),
})

export type SignupInput = z.infer<typeof signupSchema>

/** Whether the submission looks automated: honeypot filled, or filled faster than a person can. */
export function looksAutomated(input: Pick<SignupInput, "website" | "startedAt">, now: number): boolean {
  if (input.website && input.website.trim() !== "") return true
  if (input.startedAt === undefined) return true
  return now - input.startedAt < SIGNUP_MIN_FILL_MS
}

/**
 * The sign-up switch: `SIGNUP=off` closes it (operator's last resort, #810; a switch in the super
 * admin space comes with part 4c). Open by default.
 */
export function signupOpen(env: Record<string, string | undefined> = process.env): boolean {
  return (env.SIGNUP ?? "").trim().toLowerCase() !== "off"
}

/** The one answer of the form, whatever happened (sent, already known, automated). */
export const SIGNUP_ACCEPTED_MESSAGE =
  "Merci ! Si cette adresse peut recevoir un espace, un email de confirmation vient de partir : ouvrez-le pour confirmer votre adresse. Le lien est valable 24 heures."

export const SIGNUP_CLOSED_MESSAGE =
  "Les inscriptions sont fermées pour le moment. Écrivez-nous à contact@benevol.app pour demander un espace."

/** A request can be confirmed once, before it expires. */
export function confirmable(req: { expiresAt: Date; confirmedAt: Date | null } | null, now: Date): "ok" | "unknown" | "expired" | "used" {
  if (!req) return "unknown"
  if (req.confirmedAt) return "used"
  if (req.expiresAt.getTime() <= now.getTime()) return "expired"
  return "ok"
}

/** An organisation's subdomain from its name: lowercase ASCII, dashes, 60 characters at most. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/** Typed text shown in an operator alert: one line, no link-like part, 80 characters at most. */
export function plainLabel(text: string): string {
  const flat = text.replace(/[\r\n\t]+/g, " ").replace(/https?:\/\/\S+|www\.\S+/gi, "[lien retiré]").replace(/\s+/g, " ").trim()
  return flat.length > 80 ? `${flat.slice(0, 79)}…` : flat
}

