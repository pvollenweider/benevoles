// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import bcrypt from "bcryptjs"
import type { PrismaClient } from "@/generated/prisma/client"
import { normalizeEmail } from "./email-address"
import { passwordErrors } from "./password"
import { reportError } from "./report-error"
import { UPSTREAM_DOMAIN } from "./site"

/**
 * The first super admin of a self-hosted instance (#1334), created at startup from the published
 * image, which has no seed. The decision is pure: `decideAdminBootstrap` is the whole rule, tested
 * without a database. `bootstrapSuperAdmin` only reads the state it needs and runs it in one
 * transaction, serialised by an advisory lock so two pods starting together create one account.
 *
 * Once a super admin exists, the environment variables have no effect at all: this module never
 * updates, promotes, resets or detaches an existing account. Changing ADMIN_PASSWORD later does
 * not change the password (the operator uses the normal login page and profile).
 */

/** bcrypt cost used everywhere a password is set (src/app/api/..., prisma/seed.ts). */
export const ADMIN_BOOTSTRAP_BCRYPT_COST = 12

/** Transaction-scoped advisory lock serialising concurrent starts. */
export const ADMIN_BOOTSTRAP_LOCK = "admin-bootstrap"

export const DEFAULT_ADMIN_NAME = "Administrateur"

type BootstrapEnv = Record<string, string | undefined>

/**
 * Whether this is the hosted service, for the bootstrap only. Stricter than isHostedService(),
 * which also counts an instance with no address or a local one (localhost, an IP) as the hosted
 * service so development shows its pages: a try-out of the published image on
 * http://localhost:3000 is exactly where the first super admin is needed. Only an explicit
 * HOSTED_SERVICE=true, or the upstream domain itself, counts here.
 */
export function isHostedDeployment(env: BootstrapEnv): boolean {
  const explicit = env.HOSTED_SERVICE?.trim().toLowerCase()
  if (explicit === "true") return true
  if (explicit === "false") return false
  try {
    const host = new URL(env.NEXT_PUBLIC_APP_URL ?? "").hostname.replace(/^www\./, "")
    return host === UPSTREAM_DOMAIN
  } catch {
    return false
  }
}

export type AdminBootstrapDecision =
  | { action: "skip"; reason: "hosted-service" | "not-configured" | "super-admin-exists" }
  | { action: "warn"; missing: "ADMIN_EMAIL" | "ADMIN_PASSWORD" }
  | { action: "refuse"; reason: "invalid-password"; errors: string[] }
  | { action: "refuse"; reason: "email-taken"; email: string }
  | { action: "check-database" }
  | { action: "create"; email: string; name: string; password: string }

export type AdminBootstrapDatabaseState = {
  /**
   * Whether an AdminUser with role "super_admin" exists (active or not). Left undefined by the
   * startup preflight, before any query: the decision then asks for the database to be read.
   */
  superAdminExists?: boolean
  /** Whether ADMIN_EMAIL already belongs to an AdminUser. Read only once the super admin check passed. */
  emailTaken?: boolean
}

/**
 * The whole bootstrap rule, without a database. `state` is what the caller found (or knows):
 * omitted fields mean "not read yet", which yields `check-database` once the environment is
 * complete.
 *
 * Order matters: an existing super admin wins over a malformed ADMIN_PASSWORD (nothing to do),
 * and an address already in use is refused before the password rules so the operator is told the
 * one thing that needs changing (choose another address) instead of two.
 */
export function decideAdminBootstrap(
  env: BootstrapEnv,
  state: AdminBootstrapDatabaseState = {},
): AdminBootstrapDecision {
  // The hosted service has its own accounts; these variables are for self-hosted instances.
  if (isHostedDeployment(env)) return { action: "skip", reason: "hosted-service" }

  const rawEmail = env.ADMIN_EMAIL
  const rawPassword = env.ADMIN_PASSWORD
  const hasEmail = Boolean(rawEmail?.trim())
  const hasPassword = Boolean(rawPassword?.trim())
  if (!hasEmail && !hasPassword) return { action: "skip", reason: "not-configured" }
  // One set without the other is certainly a configuration mistake: say which one is missing.
  if (!hasEmail) return { action: "warn", missing: "ADMIN_EMAIL" }
  if (!hasPassword) return { action: "warn", missing: "ADMIN_PASSWORD" }

  // Nothing to do once a super admin exists, even if the environment grew stale.
  if (state.superAdminExists === true) return { action: "skip", reason: "super-admin-exists" }
  if (state.superAdminExists === undefined) return { action: "check-database" }

  const email = normalizeEmail(rawEmail!)
  if (state.emailTaken === true) return { action: "refuse", reason: "email-taken", email }

  const errors = passwordErrors(rawPassword!)
  if (errors.length > 0) return { action: "refuse", reason: "invalid-password", errors }

  return {
    action: "create",
    email,
    name: env.ADMIN_NAME?.trim() || DEFAULT_ADMIN_NAME,
    password: rawPassword!,
  }
}

export type AdminBootstrapPrisma = Pick<PrismaClient, "$transaction">

/** Logs what the decision says to do instead of creating, if anything. */
function logDecision(decision: AdminBootstrapDecision): void {
  switch (decision.action) {
    case "skip":
      // Hosted service, no configuration, or an account already there: nothing to say.
      return
    case "warn":
      console.warn(
        `⚠️ ${decision.missing} manque : aucun compte super admin créé au démarrage (l'autre variable ADMIN_* est définie).`,
      )
      return
    case "refuse":
      if (decision.reason === "invalid-password") {
        console.error(
          `❌ ADMIN_PASSWORD ne respecte pas les règles des mots de passe : ${decision.errors.join(", ")}. Aucun compte super admin créé.`,
        )
      } else {
        console.error(
          `❌ ADMIN_EMAIL (${decision.email}) correspond déjà à un compte : le premier super admin exige une adresse sans compte existant. Aucun compte n'a été modifié.`,
        )
      }
      return
    case "create":
    case "check-database":
      return
  }
}

/**
 * Creates the first super admin when the instance is self-hosted, both variables are set, no
 * super admin exists yet and the address is free. Never throws: a failure is logged in French and
 * reported (when it is unexpected) so the server still starts.
 */
export async function bootstrapSuperAdmin(env: BootstrapEnv, prisma: AdminBootstrapPrisma): Promise<void> {
  try {
    // Avoid any database work (and any transaction) when there is nothing to do.
    const preflight = decideAdminBootstrap(env)
    if (preflight.action !== "check-database") {
      logDecision(preflight) // only skip or warn can come from a state-less preflight
      return
    }

    await prisma.$transaction(async (tx) => {
      // Two pods starting together must not both create the account: the advisory lock is held
      // until this transaction ends, then the re-check below sees the first one's row.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ADMIN_BOOTSTRAP_LOCK}))`

      const superAdminExists = (await tx.adminUser.count({ where: { role: "super_admin" } })) > 0
      const email = normalizeEmail(env.ADMIN_EMAIL!)
      const emailTaken =
        !superAdminExists &&
        (await tx.adminUser.findUnique({ where: { email }, select: { id: true } })) !== null

      const decision = decideAdminBootstrap(env, { superAdminExists, emailTaken })
      if (decision.action !== "create") {
        logDecision(decision)
        return
      }

      const passwordHash = await bcrypt.hash(decision.password, ADMIN_BOOTSTRAP_BCRYPT_COST)
      await tx.adminUser.create({
        data: {
          email: decision.email,
          name: decision.name,
          passwordHash,
          role: "super_admin",
          organizationId: null,
          isActive: true,
        },
      })
      console.log(`Compte super admin créé pour ${decision.email}`)
    })
  } catch (error) {
    console.error(
      "❌ Le compte super admin n'a pas pu être créé au démarrage :",
      error instanceof Error ? error.message : error,
    )
    reportError("admin.bootstrap")(error)
  }
}
