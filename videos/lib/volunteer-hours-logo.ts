// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import sharp from "sharp"

/** Repository-owned vector artwork, rasterized locally. No AI or remote asset. */
const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80" viewBox="0 0 240 80"><rect width="240" height="80" rx="12" fill="#146b50"/><circle cx="42" cy="40" r="24" fill="#f3c45f"/><path d="M24 48L42 22L60 48Z" fill="#146b50"/><path d="M85 26H216M85 40H196M85 54H206" stroke="#fff" stroke-width="8" stroke-linecap="round"/></svg>`
let cached: Promise<{ data: Buffer; mimeType: string; width: number; height: number; hash: string }> | undefined
export function createHoursLogo() {
  return cached ??= sharp(Buffer.from(artwork)).png().toBuffer().then(data => ({ data, mimeType: "image/png", width: 240, height: 80, hash: createHash("sha256").update(data).digest("hex") }))
}
export async function assertHoursLogo(logo: { organizationId: string; data: Uint8Array; mimeType: string; width: number; height: number; hash: string } | null) {
  const expected = await createHoursLogo()
  assert(logo && logo.organizationId === "video-hours" && logo.mimeType === expected.mimeType && logo.width === expected.width && logo.height === expected.height && logo.hash === expected.hash)
  assert(Buffer.from(logo.data).equals(expected.data), "Unknown logo bytes in owned hours fixture")
}
