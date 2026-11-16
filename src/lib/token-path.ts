// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Access tokens of the public links (personal page, invitation, sector leader, waitlist offer) as
 * one path segment of a URL the browser fetches or links to.
 *
 * Generated tokens are 24 characters of `[a-z0-9]` (`generateToken`, src/lib/utils.ts); demo and
 * video seeds use readable ones (`demo-invite-camille-0001`). The shape below accepts both and
 * nothing else: letters, digits, `-` and `_`, at most 128 characters. It says nothing about
 * whether the link exists (the server looks the token up by its hash), only that the value is one
 * plain path segment: no `/`, `.`, `?`, `#`, `%` or space, so the browser can never resolve it to
 * another address. No lower bound beyond one character: the length is not what keeps the path in
 * place, and an unknown short value simply gets the server's « link not found ».
 */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{1,128}$/

export function isTokenShaped(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value)
}

/** A token read from the address or the browser's storage, kept only if it has a token's shape. */
export function tokenOrNull(value: string | null | undefined): string | null {
  return isTokenShaped(value) ? value : null
}

/**
 * `${prefix}/${token}${rest}` with the token encoded as one segment, or null when the value is not
 * token-shaped: the caller then makes no request and shows its « link not found » state.
 * `rest` is the caller's own constant suffix (`/roster`, `?slug=…`).
 */
export function tokenPath(prefix: string, token: string | null | undefined, rest = ""): string | null {
  if (!isTokenShaped(token)) return null
  return `${prefix}/${encodeURIComponent(token)}${rest}`
}

/**
 * `tokenPath` for a token the page got from the server or its own route, inside the caller's
 * try/catch: a value that is not token-shaped throws, and the caller shows its usual failure.
 */
export function requireTokenPath(prefix: string, token: string | null | undefined, rest = ""): string {
  const path = tokenPath(prefix, token, rest)
  if (!path) throw new Error("Not a link token")
  return path
}
