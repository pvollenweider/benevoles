import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

// The production image must contain videos/catalog.json, videos/manifests, videos/scripts and
// videos/MASTERCLASS_PLAN.md: src/lib/video-catalog.ts reads them with fs at build and at
// runtime (#644), the same way src/lib/__tests__/docker-public-sources.test.ts checks FEATURES.md
// and the guides. The rest of videos/ (tools, assets, output) must stay out of the image.
const root = path.join(__dirname, "..", "..", "..")
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf-8")

describe("video catalogue sources in the Docker image", () => {
  const ignore = read(".dockerignore").split("\n").map((l) => l.trim())
  const dockerfile = read("Dockerfile")

  it("re-includes the catalogue, the manifests, the scripts and the masterclass plan", () => {
    for (const pattern of ["!videos/MASTERCLASS_PLAN.md", "!videos/scripts/*.md"]) {
      expect(ignore).toContain(pattern)
    }
    // catalog.json and manifests/*.json aren't matched by the blanket `*.md` rule, so they need
    // no negation — only that nothing re-excludes them.
    for (const excluded of ["videos/catalog.json", "videos/manifests"]) {
      expect(ignore).not.toContain(excluded)
    }
  })

  it("keeps the generation tools, their library, assets and any rendered output out of the image", () => {
    for (const pattern of ["videos/assets", "videos/lib", "videos/tools", "videos/output"]) {
      expect(ignore).toContain(pattern)
    }
  })

  it("copies the four sources into the runtime image", () => {
    expect(dockerfile).toMatch(/COPY --from=builder .*\/app\/videos\/catalog\.json .\/videos\/catalog\.json/)
    expect(dockerfile).toMatch(/COPY --from=builder .*\/app\/videos\/manifests .\/videos\/manifests/)
    expect(dockerfile).toMatch(/COPY --from=builder .*\/app\/videos\/scripts .\/videos\/scripts/)
    expect(dockerfile).toMatch(/COPY --from=builder .*\/app\/videos\/MASTERCLASS_PLAN\.md .\/videos\/MASTERCLASS_PLAN\.md/)
  })
})
