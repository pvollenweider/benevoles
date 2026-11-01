// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Second factor of the synthetic platform operator of the operator videos (pentest F6): a fixed
 * fixture secret, enrolled by scripts/seed-video-operator.ts and encrypted with the local video
 * fixture key (videos/tools/operator-local.ts), never a real account or key. After the password,
 * the capture tools give a current code with passOperatorSecondFactor.
 */
import { createHash } from "node:crypto"
import type { Page } from "playwright"
import { base32Decode, timeStep, totp } from "../../src/lib/totp"
import { encryptToken } from "../../src/lib/token-vault"

export const OPERATOR_PLATFORM_EMAIL = "video.operator.platform@example.org"
/** Fixture only: the synthetic operator's authenticator secret (base32). */
export const OPERATOR_TOTP_SECRET = "VIDEOOPERATORFIXTUREONLYTOTPAAAA"

/** The secret as the app stores it, with the same fixture key as operator-local.ts. */
export function operatorTotpSecretEnc(): string {
  const key = createHash("sha256").update("benevol-local-video-fixture-only-never-production").digest()
  return encryptToken(OPERATOR_TOTP_SECRET, key, "local-video-fixture")
}

let lastStep = -1

/**
 * On the two-factor page, types a current code of the fixture secret. A code is accepted once per
 * 30-second step: a second sign-in within the same step waits for the next one, and a refusal (a
 * step spent by another tool) is retried once on the next step.
 */
export async function passOperatorSecondFactor(page: Page): Promise<void> {
  await page.waitForURL(/\/admin\/two-factor/)
  for (let attempt = 0; attempt < 2; attempt++) {
    while (timeStep(Date.now()) <= lastStep) await page.waitForTimeout(500)
    lastStep = timeStep(Date.now())
    await page.getByLabel("Code à 6 chiffres affiché par l'application", { exact: true }).fill(totp(base32Decode(OPERATOR_TOTP_SECRET), Date.now()))
    await page.getByRole("button", { name: "Valider", exact: true }).click()
    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/admin/two-factor"), { timeout: 10_000 })
      return
    } catch { /* refused: next step */ }
  }
  throw new Error("The operator's second factor was refused twice")
}
