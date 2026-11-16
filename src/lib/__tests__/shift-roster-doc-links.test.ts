import { describe, it, expect } from "vitest"
import { readDocUnits } from "../doc-units"
import { renderDocUnit } from "../public-content"
import { ROSTER_DOC_LINKS } from "../shift-roster-text"

// « En savoir plus » under the short roster texts (#1068): each opens an existing unit of content/guide/,
// at an existing heading. Renaming a unit or a heading fails here: update ROSTER_DOC_LINKS.
const units = readDocUnits()
const ids = (html: string) => [...html.matchAll(/<h[2-6] id="([^"]*)"/g)].map((m) => m[1])

describe("ROSTER_DOC_LINKS", () => {
  it.each(Object.entries(ROSTER_DOC_LINKS))("%s opens an existing heading of content/guide/", (_screen, href) => {
    const [pathname, anchor] = href.split("#")
    const slug = pathname.replace(/^\/doc\//, "")
    const unit = units.find((u) => u.slug === slug)
    expect(unit, `content/guide/${slug}.md`).toBeDefined()
    expect(ids(renderDocUnit(unit!)), `#${anchor} in ${unit!.source}`).toContain(anchor)
  })
})
