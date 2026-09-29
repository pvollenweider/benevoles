// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from "crypto"

/**
 * One-way hash for high-entropy random tokens stored for later lookup (#269). The tokens are
 * random (generateToken / randomBytes), not user-chosen, so a plain SHA-256 is enough — no salt
 * or slow KDF: there's nothing to brute-force. Must stay byte-for-byte identical to the SQL
 * used to hash pre-existing values: encode(sha256(convert_to(token, 'UTF8')), 'hex').
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}
