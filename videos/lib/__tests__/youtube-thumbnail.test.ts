// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import type { VideoCatalogEntry, VideoManifest } from "../manifest"
import { escapeHtml, thumbnailContent, thumbnailHtml, thumbnailKey } from "../youtube-thumbnail"

const manifest = (width: number, title = "S’inscrire comme bénévole depuis son téléphone") =>
  ({ id: "X", slug: "x", title, description: "", language: "fr-CH", voice: "", voiceStyle: "", segments: [], viewport: { width, height: 800, deviceScaleFactor: 1 } }) as VideoManifest
const entry = (over: Partial<VideoCatalogEntry> = {}): VideoCatalogEntry => ({ id: "X", manifest: "x", category: "c", tags: [], published: true, audience: ["benevole"], ...over })

describe("thumbnailContent", () => {
  it("takes the short title when there is one, the manifest title otherwise", () => {
    expect(thumbnailContent(manifest(390), entry({ thumbnailTitle: "S’inscrire depuis son téléphone" })).title).toBe("S’inscrire depuis son téléphone")
    expect(thumbnailContent(manifest(1280, "Créer une série de créneaux"), entry()).title).toBe("Créer une série de créneaux")
  })

  it("names the audience, organisers first when a video is for both", () => {
    expect(thumbnailContent(manifest(390), entry()).kicker).toBe("Bénévoles")
    expect(thumbnailContent(manifest(390), entry({ audience: ["benevole", "organisateur"] })).kicker).toBe("Organisateurs")
    expect(thumbnailContent(manifest(390), entry({ audience: ["super-admin"] })).kicker).toBe("Organisateurs")
  })

  it("frames a phone recording as a phone, anything wider as a browser window", () => {
    expect(thumbnailContent(manifest(390), entry()).layout).toBe("mobile")
    expect(thumbnailContent(manifest(1280), entry()).layout).toBe("desktop")
  })
})

describe("thumbnailKey", () => {
  it("changes with the title and stays stable otherwise", () => {
    const a = thumbnailContent(manifest(390), entry())
    expect(thumbnailKey(a)).toBe(thumbnailKey({ ...a }))
    expect(thumbnailKey(a)).not.toBe(thumbnailKey({ ...a, title: "Autre" }))
  })
})

describe("thumbnailHtml", () => {
  it("escapes the title and the audience", () => {
    const html = thumbnailHtml({ title: `<img src=x onerror="a">`, kicker: "A & B", layout: "mobile" }, "data:image/jpeg;base64,AA")
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;img src=x onerror=&quot;a&quot;&gt;")
    expect(html).toContain("A &amp; B")
  })

  it("uses the phone frame or the browser window", () => {
    expect(thumbnailHtml({ title: "T", kicker: "K", layout: "mobile" }, "data:,")).toContain('class="shot phone"')
    expect(thumbnailHtml({ title: "T", kicker: "K", layout: "desktop" }, "data:,")).toContain('class="shot browser"')
  })

  it("escapes every special character", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;")
  })
})
