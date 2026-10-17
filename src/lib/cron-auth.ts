// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { safeEqual } from "./safe-equal"

/**
 * Whether a call to a scheduled task (/api/cron/*) is allowed: `Authorization: Bearer
 * <CRON_SECRET>`, compared in constant time (#1048). Without a configured secret, refused in
 * production and allowed from localhost only in development, so a manual run stays easy.
 */
export function isCronAuthorized(req: Request, secret: string | undefined, nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  if (secret) return safeEqual(req.headers.get("authorization"), `Bearer ${secret}`)
  if (nodeEnv === "production") return false
  const host = req.headers.get("host") ?? ""
  return host.startsWith("localhost") || host.startsWith("127.0.0.1")
}
