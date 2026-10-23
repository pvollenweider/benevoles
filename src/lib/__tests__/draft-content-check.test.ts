import { describe, it, expect } from "vitest"
import fs from "fs"
import os from "os"
import path from "path"
import { DRAFT_MARKER, draftSources, publicContentSources } from "../../../scripts/check-no-draft-content.mjs"
import { PUBLIC_PAGES } from "../doc-pages"
import { LANDING_FAQ_SOURCE } from "../landing-seo"

// The « Draft content » CI job (scripts/check-no-draft-content.mjs) must see every public source.
// This test checks what it reads, never whether drafts remain: unit tests stay green on a draft.
describe("the draft content check", () => {
  it("reads every page source, the home's FAQ, the guides and the blog", () => {
    const sources: string[] = publicContentSources(process.cwd())
    for (const page of PUBLIC_PAGES) if (page.source) expect(sources, page.source).toContain(page.source)
    expect(sources).toContain(LANDING_FAQ_SOURCE)
    expect(sources.some((s) => s.startsWith("content/guide/"))).toBe(true)
    expect(sources.some((s) => s.startsWith("content/blog/"))).toBe(true)
  })

  it("names the files that still carry the marker", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "draft-check-"))
    fs.writeFileSync(path.join(root, "Dockerfile"), "COPY --from=builder --chown=a:b /app/A.md ./A.md\nCOPY --from=builder --chown=a:b /app/B.md ./B.md\n")
    fs.writeFileSync(path.join(root, "A.md"), `${DRAFT_MARKER} : texte à relire -->\n# A\n`)
    fs.writeFileSync(path.join(root, "B.md"), "# B\n")
    expect(draftSources(root)).toEqual(["A.md"])
    fs.rmSync(root, { recursive: true })
  })
})
