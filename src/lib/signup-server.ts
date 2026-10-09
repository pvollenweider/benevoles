// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { hashToken } from "@/lib/token-hash"
import { inviteLink } from "@/lib/invite-link"
import { isReservedOrgSlug } from "@/lib/org-subdomain"
import { reportError } from "@/lib/report-error"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { confirmable, plainLabel, slugify, SIGNUP_LINK_HOURS, type SignupInput } from "@/lib/signup"
import { blockApplies, signupKeys } from "@/lib/signup-blocklist"

/**
 * Database side of the self-service sign-up (#810, part 4b); the rules are in src/lib/signup.ts.
 * Server only (Prisma).
 */

const HOUR = 60 * 60 * 1000
const ACCOUNT_LINK_DAYS = 7

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").trim().replace(/\/+$/, "")
}

/** A free subdomain for the name: suffixed like a taken one when reserved (« medias » …). */
export async function uniqueOrgSlug(name: string, db: Pick<typeof prisma, "organization"> = prisma): Promise<string> {
  const base = slugify(name) || "association"
  let slug = base
  let suffix = 1
  while (isReservedOrgSlug(slug) || (await db.organization.findUnique({ where: { slug }, select: { id: true } }))) {
    slug = `${base}-${suffix++}`
  }
  return slug
}

/**
 * Whether the block list (#810, part 5) stops this sign-up: its address, its domain or its IP.
 * The caller answers as if nothing happened. An unknown IP (« unknown ») is not checked.
 */
export async function signupBlocked(email: string, ip: string | null, now: Date = new Date()): Promise<boolean> {
  const secret = process.env.AUTH_SECRET ?? ""
  const keys = signupKeys(email, ip && ip !== "unknown" ? ip : null, secret)
  const hits = await prisma.signupBlock.findMany({ where: { OR: keys }, select: { expiresAt: true } })
  return hits.some((b) => blockApplies(b, now))
}

/**
 * Stores the request and queues the confirmation email. Nothing is sent when the address already
 * has an account: the caller answers the same way, the form never tells.
 */
export async function createSignupRequest(input: Pick<SignupInput, "organizationName" | "contactName" | "email">, now: Date = new Date()): Promise<{ queued: boolean }> {
  const known = await prisma.adminUser.findUnique({ where: { email: input.email }, select: { id: true } })
  if (known) return { queued: false }

  const token = randomBytes(32).toString("base64url")
  await prisma.signupRequest.create({
    data: {
      organizationName: input.organizationName,
      contactName: input.contactName,
      email: input.email,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + SIGNUP_LINK_HOURS * HOUR),
    },
  })
  const ids = await enqueueNotifications([{
    kind: "signup_confirmation",
    // No typed text in this email (see renderSignupConfirmation): only the link.
    recipient: { email: input.email },
    data: {
      confirmUrl: `${appUrl()}/inscription/confirmer?t=${encodeURIComponent(token)}`,
      hours: SIGNUP_LINK_HOURS,
    },
  }])
  try { deliverAfterResponse(ids) } catch { /* outside a request: the next outbox run sends it */ }
  return { queued: true }
}

export type ConfirmResult =
  | { ok: true; inviteUrl: string; organizationSlug: string }
  | { ok: false; reason: "unknown" | "expired" | "used" | "taken" }

/** What the confirmation page shows before the button: never changes anything. */
export async function signupRequestState(token: string, now: Date = new Date()): Promise<{ state: ReturnType<typeof confirmable>; organizationName: string | null }> {
  const req = token ? await prisma.signupRequest.findUnique({ where: { tokenHash: hashToken(token) }, select: { organizationName: true, expiresAt: true, confirmedAt: true } }) : null
  return { state: confirmable(req, now), organizationName: req?.organizationName ?? null }
}

/**
 * The « Confirmer » button: creates the organisation awaiting validation (both grants null) and
 * its owner account, inactive until the password is chosen on the account activation page (the
 * returned link). Once only: the request is claimed by a conditional update first.
 */
export async function confirmSignupRequest(token: string, now: Date = new Date(), ip: string | null = null): Promise<ConfirmResult> {
  const tokenHash = hashToken(token)
  const req = await prisma.signupRequest.findUnique({ where: { tokenHash } })
  const state = confirmable(req, now)
  if (state !== "ok" || !req) return { ok: false, reason: state === "ok" ? "unknown" : state }
  // Blocked since the request was made: answered like an unknown link, nothing created.
  if (await signupBlocked(req.email, ip, now)) return { ok: false, reason: "unknown" }

  const setupToken = randomBytes(32).toString("hex")
  const placeholderHash = await bcrypt.hash(randomBytes(32).toString("hex"), 4)
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.signupRequest.updateMany({ where: { id: req.id, confirmedAt: null }, data: { confirmedAt: now } })
    if (claimed.count === 0) return { ok: false as const, reason: "used" as const }
    // The address may have got an account meanwhile (another request, an invitation).
    if (await tx.adminUser.findUnique({ where: { email: req.email }, select: { id: true } })) return { ok: false as const, reason: "taken" as const }
    const slug = await uniqueOrgSlug(req.organizationName, tx)
    const org = await tx.organization.create({
      data: {
        name: req.organizationName,
        slug,
        active: true,
        // Awaiting the operator's validation (#810, src/lib/org-approval.ts).
        publicationApprovedAt: null,
        outboundEmailApprovedAt: null,
        admins: {
          create: {
            email: req.email,
            name: req.contactName,
            passwordHash: placeholderHash,
            role: "admin",
            isActive: false,
            setupTokenHash: hashToken(setupToken),
            setupTokenExpiresAt: new Date(now.getTime() + ACCOUNT_LINK_DAYS * 24 * HOUR),
          },
        },
      },
      select: { id: true, slug: true, name: true },
    })
    await tx.signupRequest.update({ where: { id: req.id }, data: { organizationId: org.id } })
    return { ok: true as const, org }
  })
  if (!result.ok) return result

  // The operator is told at once (ntfy + email, #810); a failure never blocks the sign-up.
  void import("@/lib/operator-alerts")
    .then((m) => m.notifyOperator({
      key: `signup:${result.org.id}`,
      title: "Nouvelle demande d'espace",
      message: `${plainLabel(result.org.name)} a créé son espace et attend une validation.`,
      priority: 4,
      url: `${appUrl()}/super-admin/organizations/${result.org.slug}`,
    }))
    .catch(reportError("signup.operator_alert"))

  return { ok: true, inviteUrl: inviteLink(appUrl(), setupToken), organizationSlug: result.org.slug }
}
