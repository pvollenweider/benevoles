/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import DocSideMenu from "@/app/doc/DocSideMenu"
import { docMenuSections } from "@/lib/doc-navigation"
import type { DocUnit } from "@/lib/doc-units"

function unit(slug: string, overrides: Partial<DocUnit> = {}): DocUnit {
  return { slug, title: `Titre ${slug}`, roles: ["benevole"], group: "inscription", order: 10, summary: `Résumé de ${slug}.`, related: [], legacy: [], aliases: [], body: "Texte.\n", source: `guide/${slug}.md`, ...overrides }
}

const units = [
  unit("a"),
  unit("p", { group: "preparer", roles: ["admin"] }),
  unit("r", { group: "regles", roles: ["admin", "benevole"] }),
]

describe("DocSideMenu", () => {
  afterEach(cleanup)

  it("one navigation, its sections lists named by visible labels in a fixed order, no heading", () => {
    render(<DocSideMenu sections={docMenuSections(units, "p")} currentSlug="p" />)
    const nav = screen.getByRole("navigation", { name: "Documentation" })
    expect(within(nav).queryAllByRole("heading")).toHaveLength(0)
    expect(within(nav).queryAllByRole("region")).toHaveLength(0)
    const lists = within(nav).getAllByRole("list", { name: /^(Bénévoles|Organisateurs|Commun)$/ })
    expect(lists.map((l) => document.getElementById(l.getAttribute("aria-labelledby")!)!.textContent)).toEqual(["Bénévoles", "Organisateurs", "Commun"])
    expect(nav.querySelectorAll("details details")).toHaveLength(0)
    // The current unit is marked once, inside the only open group.
    const current = nav.querySelectorAll('[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0].closest("details")).toHaveAttribute("open")
    expect(nav.querySelectorAll("details[open]")).toHaveLength(1)
  })
})
