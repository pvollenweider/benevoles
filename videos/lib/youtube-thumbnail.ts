// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * YouTube thumbnail of a video (`make video-youtube`, videos/tools/youtube.ts): 1280 x 720 on the
 * brand blue, the logo and « benevol.app », the audience, a short title in large type on the
 * left, and the video's poster on the right, in a phone frame for a mobile recording or a tilted
 * browser window otherwise. This module builds the HTML; the tool screenshots it with Playwright.
 */
import { createHash } from "node:crypto"
import type { VideoCatalogEntry, VideoManifest } from "./manifest"
import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from "./youtube-plan"

/** Bumped when the design changes, so every thumbnail already sent is made again. */
export const THUMBNAIL_STYLE = 2
/** A recording narrower than this is a phone screen. */
const MOBILE_MAX_WIDTH = 600

export type ThumbnailContent = { title: string; kicker: string; layout: "mobile" | "desktop" }

export function thumbnailContent(manifest: VideoManifest, entry: VideoCatalogEntry): ThumbnailContent {
  const audience = entry.audience ?? []
  const kicker = audience.includes("organisateur") ? "Organisateurs" : audience.includes("benevole") ? "Bénévoles" : "Organisateurs"
  return {
    title: (entry.thumbnailTitle ?? manifest.title).trim(),
    kicker,
    layout: manifest.viewport.width < MOBILE_MAX_WIDTH ? "mobile" : "desktop",
  }
}

/** Changes whenever what the thumbnail shows changes: a new one is then sent. */
export function thumbnailKey(content: ThumbnailContent): string {
  return createHash("sha256").update(JSON.stringify([THUMBNAIL_STYLE, content.title, content.kicker, content.layout])).digest("hex").slice(0, 16)
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/** Full page; `posterSrc` is a data: URL of the poster. The title shrinks until it fits its box. */
export function thumbnailHtml(content: ThumbnailContent, posterSrc: string): string {
  const shot =
    content.layout === "mobile"
      ? `<div class="shot phone"><img src="${posterSrc}" alt=""></div>`
      : `<div class="shot browser"><div class="chrome"><b></b><b></b><b></b></div><img src="${posterSrc}" alt=""></div>`
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
html,body{width:${THUMBNAIL_WIDTH}px;height:${THUMBNAIL_HEIGHT}px;overflow:hidden;background:#1e3a8a}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;color:#fff}
.t{position:relative;width:100%;height:100%;overflow:hidden}
.text{position:absolute;z-index:2;left:72px;top:64px;bottom:60px;width:570px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:16px;font-size:34px;font-weight:700;letter-spacing:-.01em}
.logo{width:56px;height:56px;border-radius:14px;background:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 10px}
.logo i{display:block;height:8px;border-radius:4px;background:#1e3a8a}
.logo i:nth-child(1){width:24px}.logo i:nth-child(2){width:28px;background:#3b82f6;margin:5px 0 5px 8px}.logo i:nth-child(3){width:20px;margin-left:3px}
.main{flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0}
.kicker{align-self:flex-start;font-size:30px;font-weight:700;padding:8px 20px;border-radius:999px;background:#93c5fd;color:#1e3a8a;margin-bottom:24px}
h1{font-size:88px;line-height:1.02;font-weight:800;letter-spacing:-.03em;max-height:400px;overflow-wrap:break-word}
.shot{position:absolute;z-index:1;box-shadow:0 30px 60px rgba(0,0,0,.35)}
.phone{right:110px;top:46px;width:330px;border-radius:44px;padding:12px;background:#0f172a}
.phone img{display:block;width:100%;border-radius:34px}
.browser{right:-120px;top:120px;width:720px;border-radius:14px;overflow:hidden;background:#e5e7eb;transform:rotate(-3deg)}
.chrome{height:34px;display:flex;align-items:center;gap:8px;padding:0 14px}
.chrome b{width:12px;height:12px;border-radius:50%;background:#9ca3af}
.browser img{display:block;width:100%}
</style></head><body><div class="t">
<div class="text"><div class="brand"><div class="logo"><i></i><i></i><i></i></div>benevol.app</div>
<div class="main"><span class="kicker">${escapeHtml(content.kicker)}</span><h1 id="title">${escapeHtml(content.title)}</h1></div></div>
${shot}</div>
<script>
{const h=document.getElementById("title");let size=88
while(size>48&&(h.scrollHeight>400||h.scrollWidth>570)){size-=4;h.style.fontSize=size+"px"}
document.body.dataset.ready="1"}
</script></body></html>`
}
