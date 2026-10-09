// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { ImageResponse } from "next/og"
import { loadDocUnits } from "@/lib/doc-units"
import { SOCIAL_IMAGE } from "@/lib/seo-metadata"
import { socialCardFor, socialCardPaths, socialCardTitleSize } from "@/lib/social-card"
import { SITE_NAME } from "@/lib/seo-metadata"

// The social card of each public page of the apex site (src/lib/seo-metadata.ts `socialImagePath`):
// /og-image.png/doc/admin for /doc/admin, /og-image.png/doc/<unit> for a documentation unit. Under
// /og-image.png rather than a folder of its own: a path ending in .png is never an event slug, so
// it can't shadow an organisation's event, and a route handler rather than the opengraph-image
// convention gives each card a stable URL, the same in og:image and twitter:image. The cards only
// show text from the sources shipped in the image (guide/, src/lib/doc-pages.ts): rendered once
// at build, every other path is a 404.
export const dynamic = "force-static"
export const dynamicParams = false

export function generateStaticParams(): { page: string[] }[] {
  return socialCardPaths(loadDocUnits()).map((path) => ({ page: path.split("/").filter(Boolean) }))
}

// The colours of the platform's card (src/app/og-image.png/route.tsx) and icon (src/app/icon.svg).
const NAVY = "#1e3a8a"
const SOFT = "#bfdbfe"

export async function GET(_request: Request, { params }: { params: Promise<{ page: string[] }> }) {
  const { page } = await params
  const card = socialCardFor(`/${page.join("/")}`, loadDocUnits())
  if (!card) return new Response("Not found", { status: 404 })
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: NAVY, padding: "64px 80px", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 34 }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 56, height: 56, borderRadius: 14, background: "#ffffff", padding: "0 10px", marginRight: 18 }}>
            <div style={{ height: 8, width: 24, borderRadius: 4, background: NAVY }} />
            <div style={{ height: 8, width: 28, borderRadius: 4, background: "#3b82f6", margin: "5px 0 5px 8px" }} />
            <div style={{ height: 8, width: 20, borderRadius: 4, background: NAVY, marginLeft: 3 }} />
          </div>
          {SITE_NAME}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, color: SOFT, marginBottom: 20 }}>{card.eyebrow}</div>
          <div style={{ fontSize: socialCardTitleSize(card.title), lineHeight: 1.1, letterSpacing: "-0.02em" }}>{card.title}</div>
          <div style={{ fontSize: 30, color: SOFT, marginTop: 28, lineHeight: 1.35 }}>{card.detail}</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: SOFT }}>{card.footer}</div>
      </div>
    ),
    { width: SOCIAL_IMAGE.width, height: SOCIAL_IMAGE.height },
  )
}
