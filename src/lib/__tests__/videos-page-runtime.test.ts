// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

// The video detail page reads VIDEO_MEDIA_BASE_URL, which only exists in the running container:
// prerendered at build time it froze « Vidéo bientôt disponible » for every video in production.
describe("/videos/[id] is rendered per request", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/videos/[id]/page.tsx"), "utf8")

  it("is force-dynamic and never generates static params (regression)", () => {
    expect(source).toMatch(/export const dynamic = "force-dynamic"/)
    expect(source).not.toMatch(/generateStaticParams/)
  })
})

// The gallery too (2026-10-07): its robots, canonical and structured data depend on
// VIDEO_MEDIA_BASE_URL and NEXT_PUBLIC_APP_URL, read from the running container.
describe("/videos and /video-sitemap.xml are rendered per request", () => {
  for (const file of ["src/app/videos/page.tsx", "src/app/video-sitemap.xml/route.ts"]) {
    it(file, () => {
      expect(readFileSync(path.join(process.cwd(), file), "utf8")).toMatch(/export const dynamic = "force-dynamic"/)
    })
  }
})
