// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { volunteerManifest } from "@/lib/volunteer-manifest"

// The personal page's web app manifest (#593), the same token-free bytes for everyone: see
// src/lib/volunteer-manifest.ts. A static folder wins over /my/[token], and a path with a dot is
// never rewritten by the proxy (src/lib/server-not-found.ts).
export const dynamic = "force-static"

export function GET() {
  return new Response(JSON.stringify(volunteerManifest()), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  })
}
