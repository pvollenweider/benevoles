/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { act, render, screen, cleanup, within, fireEvent } from "@testing-library/react"
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
  unit("b", { body: "## Questions fréquentes\n\n### Je veux changer de créneau\n\nTexte.\n" }),
  unit("a", { group: "inscription", roles: ["admin", "benevole"] }),
  unit("c", { roles: ["admin"] }),
]

// #649: the index of the documentation units, on /doc (every unit) and on a guide's page (its role's).
describe("DocUnitIndex", () => {
  afterEach(cleanup)

  it("on /doc: every unit by group, as headings and lists, the group headings anchored, who each unit is for", () => {
    const { container } = render(<DocUnitIndex units={units} />)
    expect(screen.getByRole("heading", { level: 2, name: "Toutes les fiches" })).toBeInTheDocument()
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
    // Only the filter field has an id (React useId, never a slug).
    expect(container.querySelectorAll("[id]:not(input)")).toHaveLength(0)
    expect(container).not.toHaveTextContent("Pour")
  })

  it("renders nothing for a role without any unit", () => {
    const { container } = render(<DocUnitIndex units={[unit("b")]} role="admin" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("filters the units on their title, summary and questions, hides empty groups and says the result once the reader pauses", () => {
    vi.useFakeTimers()
    try {
      const { container } = render(<DocUnitIndex units={units} />)
      const status = screen.getByRole("status")
      expect(status).toBeEmptyDOMElement()
      const field = screen.getByRole("searchbox", { name: "Filtrer les fiches" })
      expect(field).toHaveAttribute("autocomplete", "off")
      expect(field).toHaveAttribute("enterkeyhint", "search")
      expect(field.closest("form")).toBeNull()

      // « creneau » without its accent finds b by its question, nothing else.
      fireEvent.change(field, { target: { value: "CRENEAU changer" } })
      expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual(["Titre b"])
      expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Après l'inscription"])
      expect(container.querySelector("#inscription")!.parentElement).toHaveAttribute("hidden")
      expect(status).toBeEmptyDOMElement()
      act(() => vi.advanceTimersByTime(300))
      expect(status).toHaveTextContent("1 fiche sur 3 correspond à « CRENEAU changer ».")
      expect(document.activeElement).not.toBe(status)

      fireEvent.change(field, { target: { value: "xyz" } })
      expect(screen.queryAllByRole("link")).toHaveLength(0)
      expect(screen.getByText(/Essayer un autre mot/)).toBeVisible()
      act(() => vi.advanceTimersByTime(300))
      expect(status).toHaveTextContent("Aucune fiche pour « xyz ».")
      // One « aucune fiche » sentence only: the status line's.
      expect(screen.getAllByText(/Aucune fiche/)).toHaveLength(1)

      // « Effacer le filtre » brings every unit back and gives the focus to the field.
      fireEvent.click(screen.getByRole("button", { name: "Effacer le filtre" }))
      expect(field).toHaveValue("")
      expect(field).toHaveFocus()
      expect(screen.getAllByRole("link")).toHaveLength(3)
      expect(screen.queryByRole("button", { name: "Effacer le filtre" })).toBeNull()
      expect(field.closest("search")).not.toBeNull()

      fireEvent.change(field, { target: { value: "xyz" } })

      // Échap empties a field with a value, then lets the key go.
      fireEvent.keyDown(field, { key: "Escape" })
      expect(field).toHaveValue("")
      expect(screen.getAllByRole("link")).toHaveLength(3)
      act(() => vi.advanceTimersByTime(300))
      expect(status).toHaveTextContent("Les 3 fiches sont affichées.")
      const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      field.dispatchEvent(escape)
      expect(escape.defaultPrevented).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
