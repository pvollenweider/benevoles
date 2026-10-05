// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from "node:crypto"
import sharp, { type Metadata, type OutputInfo } from "sharp"
import {
  checkLogoUpload,
  LOGO_ERRORS,
  LOGO_MAX_INPUT_PIXELS,
  LOGO_MAX_SIDE,
  LOGO_MIN_SIDE,
  LOGO_TARGET_BYTES,
  type LogoMimeType,
} from "./org-logo"

/**
 * Server-side processing of an uploaded organization logo (#300). sharp is the image library Next
 * already ships for its image optimizer (an optional dependency of `next`, declared here directly).
 *
 * The file is checked (size, real type from its first bytes), decoded with a pixel limit, turned
 * upright (EXIF orientation), reduced to LOGO_MAX_SIDE on its longest side and re-encoded, which
 * drops every metadata (EXIF, GPS, comments). The stored image is the re-encoded one, never the
 * upload: a PNG stays a PNG (sharp edges, transparency), quantized to a palette and then made
 * smaller if it is still above the target size; a JPEG stays a JPEG, its quality lowered until it
 * fits.
 */

export type ProcessedLogo = { data: Buffer; mimeType: LogoMimeType; width: number; height: number; hash: string }

export type LogoResult = { ok: true; logo: ProcessedLogo } | { ok: false; error: string }

const FORMAT_OF: Record<LogoMimeType, string> = { "image/png": "png", "image/jpeg": "jpeg" }

function decoder(input: Buffer) {
  // failOn "error": a truncated or corrupt file is refused rather than half decoded.
  return sharp(input, { limitInputPixels: LOGO_MAX_INPUT_PIXELS, failOn: "error" })
}

function isPixelLimitError(err: unknown): boolean {
  return err instanceof Error && /pixel limit/i.test(err.message)
}

export async function processLogo(bytes: Uint8Array): Promise<LogoResult> {
  const checked = checkLogoUpload(bytes)
  if (!checked.ok) return checked
  const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  let meta: Metadata
  try {
    meta = await decoder(input).metadata()
  } catch (err) {
    return { ok: false, error: isPixelLimitError(err) ? LOGO_ERRORS.tooManyPixels : LOGO_ERRORS.unreadable }
  }
  // The decoder must agree with the first bytes (a PNG signature glued on another format).
  if (meta.format !== FORMAT_OF[checked.type]) return { ok: false, error: LOGO_ERRORS.format }
  if (!meta.width || !meta.height) return { ok: false, error: LOGO_ERRORS.unreadable }
  if (meta.width * meta.height > LOGO_MAX_INPUT_PIXELS) return { ok: false, error: LOGO_ERRORS.tooManyPixels }
  // Orientations 5 to 8 swap width and height once turned upright.
  const [w, h] = (meta.orientation ?? 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height]
  if (Math.min(w, h) < LOGO_MIN_SIDE) return { ok: false, error: LOGO_ERRORS.tooSmall }

  const resized = (side: number) =>
    decoder(input)
      .rotate()
      .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
  const fits = (o: { data: Buffer } | null) => !!o && o.data.length <= LOGO_TARGET_BYTES

  try {
    let out: { data: Buffer; info: OutputInfo } | null = null
    if (checked.type === "image/png") {
      out = await resized(LOGO_MAX_SIDE).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer({ resolveWithObject: true })
      // Still too heavy (a photo saved as PNG): a 256-colour palette, then smaller sides.
      for (const side of [LOGO_MAX_SIDE, 384, 256]) {
        if (fits(out)) break
        out = await resized(side).png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer({ resolveWithObject: true })
      }
    } else {
      for (const [side, quality] of [[LOGO_MAX_SIDE, 85], [LOGO_MAX_SIDE, 75], [LOGO_MAX_SIDE, 65], [LOGO_MAX_SIDE, 55], [384, 55]]) {
        out = await resized(side).jpeg({ quality, mozjpeg: true }).toBuffer({ resolveWithObject: true })
        if (fits(out)) break
      }
    }
    if (!out) return { ok: false, error: LOGO_ERRORS.unreadable }
    return {
      ok: true,
      logo: {
        data: out.data,
        mimeType: checked.type,
        width: out.info.width,
        height: out.info.height,
        hash: createHash("sha256").update(out.data).digest("hex"),
      },
    }
  } catch (err) {
    return { ok: false, error: isPixelLimitError(err) ? LOGO_ERRORS.tooManyPixels : LOGO_ERRORS.unreadable }
  }
}
