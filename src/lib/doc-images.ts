// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from "crypto"

/**
 * The screenshots of the documentation (`/doc-img/*.png`, #759 F2, #773): rendered with their
 * intrinsic `width`/`height`, so the browser reserves their place before they load (no layout
 * shift), lazily after the first one, and with a `?v=` fingerprint of their content, so they can be
 * cached for a year (src/lib/static-cache-headers.ts) and still change the day a capture is redone.
 *
 * Pure: the file is read by the caller (src/lib/public-content.ts, server only).
 */

/** Only the documentation's own screenshots, by a plain file name: no traversal, no other folder. */
const DOC_IMAGE_PATH = /^\/doc-img\/([A-Za-z0-9][A-Za-z0-9._-]*\.png)$/

/** The file name of a `/doc-img/<name>.png` source, `null` for any other image. */
export function docImageFile(src: string): string | null {
  const m = DOC_IMAGE_PATH.exec(src)
  return m && !m[1].includes("..") ? m[1] : null
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** A PNG's pixel size, from its IHDR chunk (the first one, right after the signature); `null` if it isn't a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null
  if (PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) return null
  // Chunk length (4 bytes), then its type, which must be IHDR.
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== "IHDR") return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  return width > 0 && height > 0 ? { width, height } : null
}

/** What the page needs to draw a screenshot: its versioned URL and its intrinsic size. */
export type DocImage = { src: string; width: number; height: number }

/** A screenshot's `DocImage` from its bytes: `?v=` is the start of its content's SHA-256. */
export function docImageFromBytes(src: string, bytes: Uint8Array): DocImage | null {
  const size = pngSize(bytes)
  if (!size) return null
  const version = createHash("sha256").update(bytes).digest("hex").slice(0, 12)
  return { src: `${src}?v=${version}`, ...size }
}

const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * The `<img>` of a Markdown image. Its alt text stays as written (WCAG 1.1.1). A known screenshot
 * gets its versioned URL and its size; every image but the page's first is loaded lazily and
 * decoded off the main thread (the first may be in view at load, where lazy loading would delay it).
 */
export function docImageTag(
  image: { src: string; alt: string; title?: string | null },
  info: DocImage | null,
  index: number,
): string {
  const attrs = [`src="${escapeAttr(info?.src ?? image.src)}"`, `alt="${escapeAttr(image.alt)}"`]
  if (image.title) attrs.push(`title="${escapeAttr(image.title)}"`)
  if (info) attrs.push(`width="${info.width}"`, `height="${info.height}"`)
  if (index > 0) attrs.push(`loading="lazy"`, `decoding="async"`)
  return `<img ${attrs.join(" ")}>`
}
