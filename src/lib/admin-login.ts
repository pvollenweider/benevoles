// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { organizationAllowsSignIn } from "./admin-sign-in"
import type { LoginAttempt } from "./admin-session"

/**
 * A bcrypt hash of a random value nobody knows, at the cost of the passwords set today (12): the
 * comparison run when there is no account to check (unknown address, deactivated account,
 * organization disabled), so every refusal costs the same time as a wrong password and the
 * response time doesn't tell which addresses have an account (#1048). Not a secret.
 */
export const DUMMY_PASSWORD_HASH = "$2b$12$Cta/N0RZ/N9paWHYcDmImunzJAiayTscdod4ZtoMnU2bgFm.I5Z76"

export type LoginCandidate = {
  isActive: boolean
  role: string
  passwordHash: string
  organization: { active: boolean } | null
}

export type LoginDeps<U extends LoginCandidate> = {
  beginAttempt: (ip: string, email: string) => Promise<LoginAttempt>
  findUser: (email: string) => Promise<U | null>
  compare: (password: string, hash: string) => Promise<boolean>
  sleep: (ms: number) => Promise<void>
}

/**
 * The account that signs in with `email` and `password`, null otherwise, always with the same
 * generic outcome. Order: the failure budget (refused before any password check), the account-wide
 * wait, then exactly one bcrypt comparison, against the account's hash or the dummy one. Only a
 * success gives its attempt back to the budget.
 */
export async function verifyAdminLogin<U extends LoginCandidate>(
  { email, password, ip }: { email: string; password: string; ip: string },
  deps: LoginDeps<U>,
): Promise<U | null> {
  const attempt = await deps.beginAttempt(ip, email)
  if (!attempt.allowed) return null
  if (attempt.delayMs > 0) await deps.sleep(attempt.delayMs)

  const user = await deps.findUser(email)
  const eligible = user !== null && user.isActive && organizationAllowsSignIn(user)
  const valid = await deps.compare(password, eligible ? user.passwordHash : DUMMY_PASSWORD_HASH)
  if (!eligible || !valid) return null

  await attempt.succeeded()
  return user
}
