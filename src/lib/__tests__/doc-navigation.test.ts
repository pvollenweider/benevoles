import { describe, it, expect } from "vitest"
import { DOC_GROUPS, DOC_ROLE_GROUP_ORDER, DOC_ROLES, docGroupsInOrder, docUnitsByGroup, readDocUnits, type DocUnit } from "../doc-units"
import { docGroupSiblings, docGroupUnits, docJumpLinks, docMenuGroups, docUnitNeighbours } from "../doc-navigation"
import { docUnitHeadingIds } from "../public-content"

function unit(overrides: Partial<DocUnit> & { slug: string }): DocUnit {
  return {
    title: `Titre ${overrides.slug}`,
    roles: ["benevole"],
    group: "apres-inscription",
    order: 10,
    summary: `Résumé de ${overrides.slug}`,
    related: [],
    legacy: [],
    aliases: [],
    body: "Texte.\n",
    source: `guide/${overrides.slug}.md`,
    ...overrides,
  }
}

const units = [
  unit({ slug: "c", group: "apres-inscription", order: 30 }),
  unit({ slug: "a", group: "apres-inscription", order: 10 }),
  unit({ slug: "b", group: "apres-inscription", order: 20, roles: ["admin", "benevole"] }),
  unit({ slug: "seul", group: "inscription", order: 10 }),
  unit({ slug: "p", group: "preparer", order: 5, roles: ["admin"] }),
  unit({ slug: "q", group: "preparer", order: 5, roles: ["admin"] }),
]
const bySlug = (slug: string) => units.find((u) => u.slug === slug)!
const slugs = (list: readonly DocUnit[]) => list.map((u) => u.slug)

describe("the order of the groups on a role's guide", () => {
  it.each(DOC_ROLES)("lists every group exactly once for %s", (role) => {
    expect([...DOC_ROLE_GROUP_ORDER[role]].sort()).toEqual(DOC_GROUPS.map((g) => g.id).sort())
  })

  it("starts the organisers' guide at « Démarrer », the volunteers' at their own three groups", () => {
    expect(DOC_ROLE_GROUP_ORDER.admin.slice(0, 2)).toEqual(["demarrer", "preparer"])
    expect(DOC_ROLE_GROUP_ORDER.admin.at(-1)).toBe("aide")
    expect(DOC_ROLE_GROUP_ORDER.benevole.slice(0, 3)).toEqual(["inscription", "apres-inscription", "regles"])
  })

  it("keeps DOC_GROUPS order without a role (the /doc index)", () => {
    expect(docGroupsInOrder()).toEqual([...DOC_GROUPS])
    expect(docGroupsInOrder("admin").map((g) => g.id)).toEqual(DOC_ROLE_GROUP_ORDER.admin)
  })

  it("orders a role's index by that role's groups", () => {
    expect(docUnitsByGroup(units, "admin").map((g) => g.group.id)).toEqual(["preparer", "apres-inscription"])
    expect(docUnitsByGroup(units, "benevole").map((g) => g.group.id)).toEqual(["inscription", "apres-inscription"])
    expect(docUnitsByGroup(units).map((g) => g.group.id)).toEqual(["inscription", "apres-inscription", "preparer"])
  })
})

describe("docMenuGroups", () => {
  it("lists every group with units, for every audience, in DOC_GROUPS order, the current one marked", () => {
    const menu = docMenuGroups(units, "b")
    expect(menu.map((g) => [g.group.id, slugs(g.units), g.current])).toEqual([
      ["inscription", ["seul"], false],
      ["apres-inscription", ["a", "b", "c"], true],
      ["preparer", ["p", "q"], false],
    ])
  })

  it("marks no group for an unknown slug", () => {
    expect(docMenuGroups(units, "absent").some((g) => g.current)).toBe(false)
  })
})

describe("docGroupUnits and docGroupSiblings", () => {
  it("keeps the unit's group only, by order then slug", () => {
    expect(slugs(docGroupUnits(bySlug("c"), units))).toEqual(["a", "b", "c"])
    expect(slugs(docGroupUnits(bySlug("q"), units))).toEqual(["p", "q"])
  })

  it("leaves the unit itself out of « Dans ce thème », and is empty for a group of one", () => {
    expect(slugs(docGroupSiblings(bySlug("b"), units))).toEqual(["a", "c"])
    expect(docGroupSiblings(bySlug("seul"), units)).toEqual([])
  })
})

describe("docUnitNeighbours", () => {
  it("gives the previous and next unit in the middle of a group", () => {
    const { previous, next } = docUnitNeighbours(bySlug("b"), units)
    expect([previous?.slug, next?.slug]).toEqual(["a", "c"])
  })

  it("has no previous unit at the start and no next one at the end, never crossing groups", () => {
    expect(docUnitNeighbours(bySlug("a"), units).previous).toBeNull()
    expect(docUnitNeighbours(bySlug("a"), units).next?.slug).toBe("b")
    expect(docUnitNeighbours(bySlug("c"), units).next).toBeNull()
    expect(docUnitNeighbours(bySlug("p"), units).previous).toBeNull()
  })

  it("has neither for a group of one", () => {
    expect(docUnitNeighbours(bySlug("seul"), units)).toEqual({ previous: null, next: null })
  })

  it("breaks a tie of order by slug", () => {
    expect(docUnitNeighbours(bySlug("p"), units).next?.slug).toBe("q")
    expect(docUnitNeighbours(bySlug("q"), units).previous?.slug).toBe("p")
  })
})

describe("docJumpLinks", () => {
  it("links to both halves of a shared unit, volunteer first, whatever the order of the page", () => {
    expect(docJumpLinks(["rappels-automatiques", "cote-organisation", "cote-benevole"])).toEqual([
      { href: "#cote-benevole", label: "Côté bénévole" },
      { href: "#cote-organisation", label: "Côté organisation" },
    ])
  })

  it("has nothing for a unit with one half or none", () => {
    expect(docJumpLinks(["cote-organisation"])).toEqual([])
    expect(docJumpLinks(["cote-benevole", "autre"])).toEqual([])
    expect(docJumpLinks([])).toEqual([])
  })

  it("finds both halves on the real shared units, and only there", () => {
    const real = readDocUnits()
    const withJumps = real.filter((u) => docJumpLinks(docUnitHeadingIds(u)).length > 0).map((u) => u.slug)
    expect(withJumps).toContain("rappels")
    for (const slug of withJumps) expect(real.find((u) => u.slug === slug)!.roles.sort(), slug).toEqual(["admin", "benevole"])
  })
})
