// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from "crypto"

/**
 * Proof of acceptance of the volunteer charter (#569): a stable fingerprint of the exact text
 * shown to the volunteer at public sign-up — the organization's own custom text, or the default
 * with its insurance variant (see src/lib/volunteer-charter.ts, resolveCharterText) — stored on
 * the registration (charterAcceptedHash/At) alongside the acceptance date. Resolving the hash back
 * to its text later needs CharterVersion (hash → text per organization), upserted once per
 * distinct text actually shown (see the public registrations route).
 *
 * Not imported by any client component: unlike volunteer-charter.ts, this pulls in Node's "crypto"
 * which doesn't bundle for the browser.
 */

/** Strips incidental whitespace differences (line endings, surrounding blanks) before hashing:
 * any change to the actual wording still changes the hash. */
export function normalizeCharterText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim()
}

/** SHA-256 of the normalised text, hex-encoded. */
export function hashCharterText(text: string): string {
  return createHash("sha256").update(normalizeCharterText(text), "utf8").digest("hex")
}
