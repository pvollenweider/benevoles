// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { ImageResponse } from "next/og"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import { SITE_NAME } from "@/lib/seo-metadata"

// The video library's social card (/videos link previews, src/lib/video-seo.ts). A route handler,
// like /og-image.png, not the opengraph-image file convention: that one would also apply to every
// /videos/<ID>, whose own preview is the video's poster. Built once per deployment from the
// committed catalogue; its path ends in .png, which no video id can contain.
export const dynamic = "force-static"

export function GET() {
  const count = loadVideoCatalog().filter((v) => v.published).length
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#1e3a8a", padding: "72px 80px", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 700 }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 56, height: 56, borderRadius: 14, background: "#ffffff", padding: "0 10px", marginRight: 18 }}>
            <div style={{ height: 8, width: 24, borderRadius: 4, background: "#1e3a8a" }} />
            <div style={{ height: 8, width: 28, borderRadius: 4, background: "#3b82f6", margin: "5px 0 5px 8px" }} />
            <div style={{ height: 8, width: 20, borderRadius: 4, background: "#1e3a8a", marginLeft: 3 }} />
          </div>
          {SITE_NAME}
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* A play button, drawn: no icon font in ImageResponse. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 132, height: 132, borderRadius: 66, background: "#ffffff", marginRight: 48, flexShrink: 0 }}>
            <svg width="50" height="58" viewBox="0 0 50 58" style={{ marginLeft: 10 }}>
              <path d="M0 0 L50 29 L0 58 Z" fill="#1e3a8a" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.02em" }}>Tutoriels vidéo {SITE_NAME}</div>
            <div style={{ fontSize: 32, color: "#bfdbfe", marginTop: 24, lineHeight: 1.35 }}>
              {`${count} vidéos pour organiser vos bénévoles, pas à pas.`}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 24, color: "#bfdbfe" }}>Gratuit · Open source · En français, avec transcription</div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
