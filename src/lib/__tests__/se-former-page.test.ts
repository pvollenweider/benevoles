// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { pageAvailable, publicPage } from "../doc-pages"
import { metaLengthProblems } from "../meta-length"
import { pageTitle } from "../seo-metadata"

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf-8")

const PATH = "/se-former"
const page = publicPage(PATH)
const source = read(page.source!)

type CatalogVideo = { id: string; manifest: string; published: boolean; audience?: string[] }
const catalog = JSON.parse(read("videos/catalog.json")) as { videos: CatalogVideo[] }
const renders = JSON.parse(read("videos/renders.json")) as Record<string, { durationMs: number }>
const byId = new Map(catalog.videos.map((v) => [v.id, v]))

const embedded = [...source.matchAll(/<!-- video: ([A-Z0-9_]+) -->/g)].map((m) => m[1])
const linked = [...source.matchAll(/\]\(\/videos\/([A-Z0-9_]+)\)/g)].map((m) => m[1])

// The training path promises « treize vidéos » and « moins d'une heure »: both are counted from
// the catalog, so a refilm that lengthens a video, or one unpublished, fails here first.
describe("/se-former, the training path", () => {
  it("is a hosted presentation page rendered from SE-FORMER.md, with metadata that fits search results", () => {
    expect(page).toMatchObject({ path: PATH, title: "Se former en une heure", source: "content/pages/SE-FORMER.md", guide: false, presentation: true, availability: "hosted" })
    expect(pageAvailable(page, true)).toBe(true)
    expect(pageAvailable(page, false)).toBe(false)
    expect(metaLengthProblems(pageTitle(page.metaTitle), page.metaDescription)).toEqual([])
  })

  it("plays thirteen distinct published videos, for organisers except the one showing the volunteer's side", () => {
    expect(embedded).toHaveLength(13)
    expect(new Set(embedded).size).toBe(13)
    expect(source).toMatch(/^Treize vidéos/m)
    for (const id of embedded) {
      const video = byId.get(id)
      expect(video, id).toBeDefined()
      expect(video!.published, id).toBe(true)
      // Step 3 shows on purpose what the volunteers see on their phone.
      if (id !== "VOLUNTEER_REGISTER") expect(video!.audience, id).toContain("organisateur")
    }
  })

  it("lasts under an hour in all, as the title says", () => {
    const totalMs = embedded.reduce((sum, id) => sum + renders[byId.get(id)!.manifest].durationMs, 0)
    expect(totalMs).toBeLessThan(60 * 60 * 1000)
  })

  it("links only to published videos in its text", () => {
    expect(linked.length).toBeGreaterThan(0)
    for (const id of linked) expect(byId.get(id)?.published, id).toBe(true)
  })
})
