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
    for (const excluded of ["videos/catalog.json", "videos/renders.json", "videos/manifests"]) {
      expect(ignore).not.toContain(excluded)
    }
  })

  it("keeps the generation tools, their library, assets and any rendered output out of the image", () => {
    for (const pattern of ["videos/assets", "videos/lib", "videos/tools", "videos/output"]) {
      expect(ignore).toContain(pattern)
    }
  })

  // #910 imported videos/lib from scripts/seed-video-scenario.ts: the PR's type-check passed,
  // but the image build type-checks only its own context and failed on the missing module.
  it("keeps every script that imports the video library out of the image too", () => {
    expect(ignore).toContain("scripts/seed-video-*.ts")
    const scripts = fs.readdirSync(path.join(root, "scripts")).filter((f) => /\.(ts|mts|mjs|js)$/.test(f))
    const importing = scripts.filter((f) => /from ["']\.\.\/videos\/(lib|tools|assets)\//.test(read(`scripts/${f}`)))
    for (const f of importing) expect(f).toMatch(/^seed-video-.*\.ts$/)
  })

  it("copies the four sources into the runtime image", () => {
    expect(dockerfile).toMatch(/COPY --from=builder .*\/app\/videos\/catalog\.json .\/videos\/catalog\.json/)
    // Real duration, frame size and posters of the published renders (videos/tools/posters.ts).
    expect(dockerfile).toMatch(/COPY --from=builder .*\/app\/videos\/renders\.json .\/videos\/renders\.json/)
    expect(dockerfile).toMatch(/COPY --from=builder .*\/app\/videos\/manifests .\/videos\/manifests/)
    expect(dockerfile).toMatch(/COPY --from=builder .*\/app\/videos\/scripts .\/videos\/scripts/)
    expect(dockerfile).toMatch(/COPY --from=builder .*\/app\/videos\/MASTERCLASS_PLAN\.md .\/videos\/MASTERCLASS_PLAN\.md/)
  })
})
