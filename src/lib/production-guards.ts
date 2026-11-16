// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { appTimeZone, assertTimeZone } from "./time-zone"
import { keyring } from "./token-vault"

/**
 * Checks run once when the server starts (instrumentation.ts), not at build time: the Docker
 * build evaluates env.ts with placeholder values, so a hard requirement there would break it.
 *
 * TOKEN_ENCRYPTION_KEY is required in production (#290): without it the app still works, but
 * personal link tokens are stored in clear, so a DB dump would hand out working links again
 * without anyone noticing. Failing to start makes a missing secret visible: with
 * `maxUnavailable: 0` the previous pod keeps serving and the deploy's rollout check fails.
 *
 * AUTH_SECRET must not be a value published in this repository (an example file, a compose
 * default, the image build value) or an obvious stand-in: it keys the session cookies, so a
 * public value would let anyone sign a session. Same for CRON_SECRET when it is set.
 */
/** Values shipped in this repository as examples or build stand-ins, never valid at runtime. */
export const KNOWN_PLACEHOLDER_SECRETS: readonly string[] = [
  "une-chaine-aleatoire-32-chars-minimum", // former .env.example
  "change-me-in-production-32chars", // former docker-compose.yml default
  "build-placeholder-secret-32-characters-min", // Dockerfile, builder stage only
  "CHANGEME", // k8s/secret.yaml
]

// Words that only a hand-written stand-in contains (a random value practically never does).
const PLACEHOLDER_WORDS = /change[-_ ]?me|placeholder|replace[-_ ]?me|your[-_ ]?secret|une-chaine|secret-here|example|xxxxxx/i

/**
 * Why a secret value is unfit for production, or null when it looks random enough: a known
 * placeholder, a stand-in word, or too few distinct characters ("aaaa…", "1234…").
 */
export function placeholderSecretReason(value: string): string | null {
  const v = value.trim()
  if (KNOWN_PLACEHOLDER_SECRETS.some((p) => p.toLowerCase() === v.toLowerCase())) return "it is an example value published in the repository"
  if (PLACEHOLDER_WORDS.test(v)) return "it looks like a placeholder"
  if (new Set(v).size < 10) return "it has too few distinct characters to be random"
  return null
}

export function assertProductionSecrets(env: Record<string, string | undefined> = process.env): void {
  // Malformed keys (current or previous, #313) fail at startup in every environment rather
  // than on the first token read or written.
  keyring(env)
  // Same for the time zone (#343), in every environment.
  assertTimeZone(appTimeZone(env))
  if (env.NODE_ENV !== "production") return
  if (!env.TOKEN_ENCRYPTION_KEY?.trim()) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is required in production (32 random bytes, base64: `openssl rand -base64 32`). " +
        "Without it personal link tokens would be stored in clear. See README, variables d'environnement.",
    )
  }
  for (const name of ["AUTH_SECRET", "CRON_SECRET"] as const) {
    const value = env[name]
    // A missing AUTH_SECRET is reported by env.ts, a missing CRON_SECRET by the cron routes.
    if (!value?.trim()) continue
    const reason = placeholderSecretReason(value)
    if (reason) {
      throw new Error(
        `${name} is not usable in production: ${reason}. ` +
          "Generate a random value (`openssl rand -base64 32`) and set it in the environment. See docs/configuration.md.",
      )
    }
  }
}
