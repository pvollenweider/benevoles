/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"
import DocUnitIndex from "../public/DocUnitIndex"
import type { DocUnit } from "@/lib/doc-units"

function unit(slug: string, overrides: Partial<DocUnit> = {}): DocUnit {
  return {
    slug,
    title: `Titre ${slug}`,
    roles: ["benevole"],
    group: "apres-inscription",
    order: 10,
    summary: `Résumé de ${slug}.`,
    related: [],
    legacy: [],
    aliases: [],
    body: "Texte.\n",
    source: `guide/${slug}.md`,
    ...overrides,
  }
}

const units = [
  unit("b"),
  unit("a", { group: "inscription", roles: ["admin", "benevole"] }),
  unit("c", { roles: ["admin"] }),
]

// #649: the index of the documentation units, on /doc (every unit) and on a guide's page (its role's).
describe("DocUnitIndex", () => {
  afterEach(cleanup)

  it("on /doc: every unit by group, as headings and lists, the group headings anchored, who each unit is for", () => {
    const { container } = render(<DocUnitIndex units={units} />)
    expect(screen.getByRole("heading", { level: 2, name: "Pages par thème" })).toBeInTheDocument()
    const groups = screen.getAllByRole("heading", { level: 3 })
    expect(groups.map((h) => [h.textContent, h.id])).toEqual([
      ["S'inscrire à un créneau", "inscription"],
      ["Après l'inscription", "apres-inscription"],
    ])
    const lists = screen.getAllByRole("list")
    expect(within(lists[0]).getByRole("link", { name: "Titre a" })).toHaveAttribute("href", "/doc/a")
    expect(within(lists[1]).getAllByRole("link").map((l) => l.textContent)).toEqual(["Titre b", "Titre c"])
    expect(lists[0]).toHaveTextContent(/^Titre a\s: Résumé de a\. Pour\s: organisateurs, bénévoles\.$/)
    // Link names are the units' titles, each once.
    const names = [...container.querySelectorAll("a")].map((a) => a.textContent)
    expect(new Set(names).size).toBe(names.length)
  })

  it("on a guide's page: that role's units only, no ids (the guide's own anchors stay as they were)", () => {
    const { container } = render(<DocUnitIndex units={units} role="admin" />)
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/doc/a", "/doc/c"])
    expect(container.querySelectorAll("[id]")).toHaveLength(0)
    expect(container).not.toHaveTextContent("Pour")
  })

  it("renders nothing for a role without any unit", () => {
    const { container } = render(<DocUnitIndex units={[unit("b")]} role="admin" />)
    expect(container).toBeEmptyDOMElement()
  })
})
