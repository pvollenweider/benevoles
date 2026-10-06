import { describe, it, expect } from "vitest"
import { DOC_ROLES, readDocUnits, resolveLegacyAnchor, type DocRole } from "../doc-units"
import { docUnitHeadingIds, headingIdsOf, renderPublicSource } from "../public-content"
import { publicPage } from "../doc-pages"
import { DOC_ROLE_INFO } from "../doc-units"
import legacyAnchors from "./fixtures/legacy-doc-anchors.json"

/**
 * #649: the guides are split into units, and every link into them must keep working. The fixture
 * freezes the heading ids of GUIDE_ADMIN.md and GUIDE_BENEVOLE.md as /doc/admin and /doc/benevole
 * rendered them before the split (86 anchors, generated once on 2026-10-06 with the pages' own
 * renderer and slugger, renderPublicSource in src/lib/public-content.ts). It is never regenerated:
 * an anchor leaving its guide must be claimed by a unit (`legacy: [role#anchor]` in its front
 * matter), which LegacyAnchorRedirect then follows on the guide's page.
 */
const fixture = legacyAnchors as Record<DocRole, string[]>
const units = readDocUnits()

// The ids a guide's page still renders from its source (its introduction, above the questions and
// the index): an anchor that isn't one of them must be claimed by a unit.
const guideIds = (role: DocRole): Set<string> => {
  const page = publicPage(DOC_ROLE_INFO[role].path)
  return page.source ? new Set(headingIdsOf(renderPublicSource(page.source, page.title).html)) : new Set()
}

describe("the frozen anchors of the old guides", () => {
  it("cover both guides, each id once", () => {
    expect(Object.keys(fixture).sort()).toEqual([...DOC_ROLES].sort())
    expect(fixture.admin.length + fixture.benevole.length).toBe(86)
    for (const role of DOC_ROLES) expect(new Set(fixture[role]).size, role).toBe(fixture[role].length)
  })

  it.each(DOC_ROLES)("each anchor of the %s guide is still on its page, or leads to a unit (and its heading when the fragment is kept)", (role) => {
    const onPage = guideIds(role)
    const unitSlugs = new Set(units.map((u) => u.slug))
    for (const anchor of fixture[role]) {
      if (onPage.has(anchor)) continue
      const target = resolveLegacyAnchor(role, anchor, units, docUnitHeadingIds)
      expect(target, `/doc/${role}#${anchor} left the guide: claim it with « legacy: [${role}#${anchor}] » in its unit`).not.toBeNull()
      const [pathname, fragment] = target!.split("#")
      const slug = pathname.replace(/^\/doc\//, "")
      expect(unitSlugs.has(slug), target!).toBe(true)
      if (fragment) expect(docUnitHeadingIds(units.find((u) => u.slug === slug)!), target!).toContain(fragment)
    }
  })

  it("leave no anchor of the volunteer guide on its page: it is entirely split, each anchor claimed by a unit", () => {
    const onPage = guideIds("benevole")
    const claimed = new Set(units.flatMap((u) => u.legacy))
    for (const anchor of fixture.benevole) {
      expect(onPage.has(anchor), anchor).toBe(false)
      expect(claimed.has(`benevole#${anchor}`), anchor).toBe(true)
    }
  })

  it("are the only anchors a unit can claim (an anchor the guides never had is a typo)", () => {
    for (const unit of units) {
      for (const key of unit.legacy) {
        const [role, anchor] = key.split("#") as [DocRole, string]
        expect(fixture[role], `${unit.source}: ${key}`).toContain(anchor)
      }
    }
  })
})
