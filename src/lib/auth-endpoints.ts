// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** next-auth's own routes (src/app/api/auth/[...nextauth]): `/api/auth` and below, nothing else. */
export function isAuthEndpoint(pathname: string): boolean {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/")
}
