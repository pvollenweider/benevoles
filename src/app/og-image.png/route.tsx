// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { ImageResponse } from "next/og"

// The social card of the apex home (Open Graph and Twitter, see src/lib/landing-seo.ts). A route
// handler rather than the opengraph-image file convention: that one would apply to every page
// below the root, organisation event pages included, which must not carry benevol.app's card.
// The path ends in .png, which no event slug can contain, so it never shadows an event.
export const dynamic = "force-static"

const BARS = [
  { left: 0, width: 300, color: "#ffffff" },
  { left: 120, width: 330, color: "#93c5fd" },
  { left: 40, width: 240, color: "#ffffff" },
  { left: 200, width: 250, color: "#93c5fd" },
]

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1e3a8a", padding: "72px 80px", color: "#ffffff" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640 }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 700 }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 56, height: 56, borderRadius: 14, background: "#ffffff", padding: "0 10px", marginRight: 18 }}>
              <div style={{ height: 8, width: 24, borderRadius: 4, background: "#1e3a8a" }} />
              <div style={{ height: 8, width: 28, borderRadius: 4, background: "#3b82f6", margin: "5px 0 5px 8px" }} />
              <div style={{ height: 8, width: 20, borderRadius: 4, background: "#1e3a8a", marginLeft: 3 }} />
            </div>
            benevol.app
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.02em" }}>
              Vos bénévoles s’inscrivent sans compte.
            </div>
            <div style={{ fontSize: 30, color: "#bfdbfe", marginTop: 28, lineHeight: 1.35 }}>
              Postes, créneaux, rappels et feuilles du jour J, pour votre festival ou votre association.
            </div>
          </div>
          <div style={{ fontSize: 24, color: "#bfdbfe" }}>Gratuit · Open source · Hébergé en France</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", marginLeft: 20, width: 380 }}>
          {BARS.map((b, i) => (
            <div key={i} style={{ height: 44, width: b.width * 0.8, marginLeft: b.left * 0.5, borderRadius: 12, background: b.color, marginBottom: 26, opacity: 0.95 }} />
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
