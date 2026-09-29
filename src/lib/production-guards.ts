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
 */
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
}
