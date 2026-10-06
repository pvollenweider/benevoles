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

// A guide entirely split into units has no source any more (the volunteer guide): its page is the
// index alone, so every one of its anchors must be claimed by a unit.
const guideIds = (role: DocRole): Set<string> => {
  const page = publicPage(DOC_ROLE_INFO[role].path)
  return page.source ? new Set(headingIdsOf(renderPublicSource(page.source, page.title).html)) : new Set()
}
const rolesWithGuide = DOC_ROLES.filter((role) => publicPage(DOC_ROLE_INFO[role].path).source)

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

  it("leave no anchor of the volunteer guide on a page: it is entirely split, each anchor claimed by a unit", () => {
    expect(rolesWithGuide).toEqual(["admin"])
    const claimed = new Set(units.flatMap((u) => u.legacy))
    for (const anchor of fixture.benevole) expect(claimed.has(`benevole#${anchor}`), anchor).toBe(true)
  })

  it.each(rolesWithGuide)("keep their ids when the %s guide is rendered under « Le guide complet », one level down", (role) => {
    const page = publicPage(DOC_ROLE_INFO[role].path)
    const flat = renderPublicSource(page.source!, page.title).html
    const shifted = renderPublicSource(page.source!, page.title, null, { shiftHeadings: true }).html
    expect(headingIdsOf(shifted)).toEqual(headingIdsOf(flat))
    expect(shifted).not.toMatch(/<h2[ >]/)
    expect(shifted.match(/<h3[ >]/g)?.length).toBe(flat.match(/<h2[ >]/g)?.length)
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
