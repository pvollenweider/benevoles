// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "fs"
import path from "path"
import { describe, it, expect } from "vitest"
import { applyVideoFilters, audiencesInUse, filterPublishedVideos, levelsInUse, tagsInUse, themesInUse, toGalleryVideo } from "../video-catalog"
import { loadVideoCatalog } from "../video-catalog-load"

// /videos handed the whole catalogue entry of every video (narration segments, editorial script,
// production notes) to its client component: 490 KB of the page's 820 KB (#759).
describe("toGalleryVideo", () => {
  const catalog = filterPublishedVideos(loadVideoCatalog())
  const gallery = catalog.map(toGalleryVideo)

  it("keeps only what the cards, the filters and the search read", () => {
    for (const v of gallery) {
      expect(Object.keys(v).sort()).toEqual(["audience", "description", "durationMs", "feature", "id", "level", "manifest", "published", "tags", "themes", "title"])
      expect(Object.keys(v.manifest)).toEqual(["viewer"])
      expect(Object.keys(v.manifest.viewer).sort()).toEqual(["steps", "summary"])
    }
  })

  it("filters and searches exactly like the full catalogue", () => {
    const ids = (videos: { id: string }[]) => videos.map((v) => v.id)
    const step = catalog[0].manifest.viewer.steps[0]
    for (const query of ["", "créneau", step.slice(0, 20), catalog[0].tags[0] ?? ""]) {
      expect(ids(applyVideoFilters(gallery, { query })), query).toEqual(ids(applyVideoFilters(catalog, { query })))
    }
    expect(themesInUse(gallery)).toEqual(themesInUse(catalog))
    expect(levelsInUse(gallery)).toEqual(levelsInUse(catalog))
    expect(tagsInUse(gallery)).toEqual(tagsInUse(catalog))
    expect(audiencesInUse(gallery)).toEqual(audiencesInUse(catalog))
  })

  it("is a small fraction of the full catalogue", () => {
    const full = JSON.stringify(catalog).length
    const slim = JSON.stringify(gallery).length
    expect(slim).toBeLessThan(full / 4)
  })

  it("is what the /videos page passes to the gallery", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src/app/videos/page.tsx"), "utf-8")
    expect(page).toContain("<VideoGallery videos={videos.map(toGalleryVideo)} />")
  })
})
