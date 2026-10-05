// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Organization logo (#300, part 2): the rules shared by the upload route, the public image route
 * and every place that shows the logo (public pages, printed sheets, badges, certificate, emails).
 * Pure and client-safe (no Prisma, no sharp): the image processing is in org-logo-image.ts.
 *
 * Decisions (owner, 2026-10-05): stored in Postgres (OrganizationLogo), PNG or JPEG only, never
 * SVG, the real type read from the file's first bytes, resized server-side, served from the app's
 * own origin (no CSP change), deleted with the organization. The logo never carries information
 * on its own: the organization's name is always written next to it, or is its alternative text.
 */

/** Largest file accepted on upload. */
export const LOGO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024
/** Longest side of the stored image, in pixels. */
export const LOGO_MAX_SIDE = 512
/** Size the stored image aims for (the processing re-encodes harder above it). */
export const LOGO_TARGET_BYTES = 200 * 1024
/** Shortest side accepted, in pixels: below that a logo is unreadable. */
export const LOGO_MIN_SIDE = 32
/** Decoded pixels accepted at most (protection against decompression bombs). */
export const LOGO_MAX_INPUT_PIXELS = 24_000_000

export const LOGO_MIME_TYPES = ["image/png", "image/jpeg"] as const
export type LogoMimeType = (typeof LOGO_MIME_TYPES)[number]
/** The file input's `accept`: a hint for the file picker, never trusted. */
export const LOGO_ACCEPT = LOGO_MIME_TYPES.join(",")

export const LOGO_HINT = "PNG ou JPEG, 2 Mo au plus. Le logo est réduit à 512 pixels de côté au plus. Il est affiché et imprimé sur fond blanc, souvent en noir et blanc : préférez une version foncée sur fond clair ou transparent."

export const LOGO_ERRORS = {
  empty: "Choisissez une image PNG ou JPEG.",
  tooLarge: "Ce fichier dépasse 2 Mo. Réduisez l'image ou enregistrez-la en JPEG, puis réessayez.",
  svg: "Les images SVG ne sont pas acceptées. Enregistrez votre logo en PNG ou en JPEG, puis réessayez.",
  format: "Ce fichier n'est pas une image PNG ou JPEG. Enregistrez votre logo dans l'un de ces formats, puis réessayez.",
  unreadable: "Cette image est illisible ou endommagée. Enregistrez-la à nouveau en PNG ou en JPEG, puis réessayez.",
  tooManyPixels: "Cette image est trop grande (plus de 24 millions de pixels). Réduisez-la, puis réessayez.",
  tooSmall: `Cette image est trop petite : au moins ${LOGO_MIN_SIDE} pixels de côté.`,
} as const

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * The image type from the file's first bytes (magic numbers), whatever its name or declared type:
 * PNG (89 50 4E 47 0D 0A 1A 0A) or JPEG (FF D8 FF). Anything else is null.
 */
export function sniffLogoType(bytes: Uint8Array): LogoMimeType | null {
  if (bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return "image/png"
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  return null
}

/** Whether the bytes look like SVG (or any XML/HTML text), to say so in the refusal. */
export function looksLikeSvg(bytes: Uint8Array): boolean {
  let start = 0
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3 // UTF-8 BOM
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(start, start + 512)).trimStart().toLowerCase()
  return head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("<!doctype svg") || (head.startsWith("<") && head.includes("<svg"))
}

/**
 * The first check of an upload, before any decoding: size, then real type. Returns the refusal
 * message, or the sniffed type.
 */
export function checkLogoUpload(bytes: Uint8Array): { ok: true; type: LogoMimeType } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: LOGO_ERRORS.empty }
  if (bytes.length > LOGO_MAX_UPLOAD_BYTES) return { ok: false, error: LOGO_ERRORS.tooLarge }
  const type = sniffLogoType(bytes)
  if (type) return { ok: true, type }
  return { ok: false, error: looksLikeSvg(bytes) ? LOGO_ERRORS.svg : LOGO_ERRORS.format }
}

/**
 * A first check in the browser, from the file's declared type and size, before sending it. The
 * server checks again from the file's bytes (checkLogoUpload); an empty type is left to it.
 */
export function logoFileProblem(file: { size: number; type: string } | null | undefined): string | null {
  if (!file || file.size === 0) return LOGO_ERRORS.empty
  if (file.type === "image/svg+xml") return LOGO_ERRORS.svg
  if (file.type && !(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) return LOGO_ERRORS.format
  if (file.size > LOGO_MAX_UPLOAD_BYTES) return LOGO_ERRORS.tooLarge
  return null
}

/** What a page needs to show the logo: its same-origin URL and its stored size (for width/height). */
export type OrgLogo = { src: string; width: number; height: number }

/** Version of the URL: the start of the image's SHA-256, so a new logo is a new URL. */
export const logoVersion = (hash: string) => hash.slice(0, 16)

/** Same-origin path of an organization's logo, versioned by its hash. */
export function orgLogoPath(organizationId: string, hash: string): string {
  return `/api/public/organizations/${encodeURIComponent(organizationId)}/logo?v=${logoVersion(hash)}`
}

/** The logo of a loaded organization row (`logo: { select: { hash, width, height } }`), or null. */
export function orgLogoOf(
  organizationId: string,
  logo: { hash: string; width: number; height: number } | null | undefined,
): OrgLogo | null {
  if (!logo) return null
  return { src: orgLogoPath(organizationId, logo.hash), width: logo.width, height: logo.height }
}

/** Prisma select of the logo's metadata, never its bytes. */
export const ORG_LOGO_SELECT = { select: { hash: true, width: true, height: true } } as const

/**
 * Displayed size of a logo inside a box, keeping its proportions and never enlarging it.
 * Rounded to whole pixels, at least 1.
 */
export function fitLogo(width: number, height: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: maxWidth, height: maxHeight }
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * Alternative text of the logo. Next to the organization's name written out (a page header, a
 * printed sheet), the logo adds nothing for a screen reader: empty, so the name isn't read twice.
 * Alone (an email, where the image may be blocked), it is the organization's name.
 */
export function orgLogoAlt(organizationName: string, nameShownBeside: boolean): string {
  return nameShownBeside ? "" : organizationName.trim()
}

/**
 * Cache headers of the public image route. The URL carries the version: when it matches the
 * stored image, the response never changes (immutable for a year); an old or missing version
 * (an email sent before the logo changed) gets the current image, revalidated after an hour.
 */
export function logoCacheControl(requestedVersion: string | null, hash: string): string {
  return requestedVersion === logoVersion(hash)
    ? "public, max-age=31536000, immutable"
    : "public, max-age=3600, must-revalidate"
}

/** ETag of a stored image: its hash, quoted. */
export const logoEtag = (hash: string) => `"${hash}"`

/** Whether an If-None-Match header already names this image (weak or strong, or *). */
export function etagMatches(ifNoneMatch: string | null, hash: string): boolean {
  if (!ifNoneMatch) return false
  const etag = logoEtag(hash)
  return ifNoneMatch.split(",").map((t) => t.trim().replace(/^W\//, "")).some((t) => t === etag || t === "*")
}

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/**
 * The logo in a printable HTML page (sheets, badges), next to the organization's name: decorative
 * (alt=""), grey-scaled when printed so it reads like the rest of the monochrome page.
 */
export function printLogoHtml(logo: OrgLogo | null | undefined, className: string, box: { maxWidth: number; maxHeight: number }): string {
  if (!logo) return ""
  const size = fitLogo(logo.width, logo.height, box.maxWidth, box.maxHeight)
  return `<img class="${escAttr(className)}" src="${escAttr(logo.src)}" alt="" width="${size.width}" height="${size.height}">`
}

/**
 * The logo at the top of an email (#300). Hosted, not attached: an inline (CID) copy would make
 * every email up to 200 KB heavier and data: URIs are blocked by the main webmails. The URL has no
 * per-recipient part (no open tracking). With images blocked, the client shows the alternative
 * text, the organization's name, in the styled box reserved by width and height.
 */
export function emailLogoHtml(logo: OrgLogo, absoluteBase: string, organizationName: string): string {
  const size = fitLogo(logo.width, logo.height, 200, 64)
  const src = `${absoluteBase.replace(/\/$/, "")}${logo.src}`
  return `<div style="margin:0 0 24px"><img src="${escAttr(src)}" alt="${escAttr(orgLogoAlt(organizationName, false))}" width="${size.width}" height="${size.height}" style="display:block;border:0;outline:none;text-decoration:none;width:${size.width}px;max-width:100%;height:auto;font-size:16px;font-weight:600;line-height:1.3;color:#111111"></div>`
}
