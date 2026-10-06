/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { act, render, screen, cleanup, within, fireEvent } from "@testing-library/react"
import { renderToString } from "react-dom/server"
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
    // The title link on its own line, then the summary (and who it is for) below it, not in the link.
    const link = within(lists[0]).getByRole("link", { name: "Titre a" })
    const summary = link.nextElementSibling!
    expect(summary).toHaveClass("block", "text-sm")
    expect(summary).toHaveTextContent(/^Résumé de a\. Pour\s: organisateurs, bénévoles\.$/)
    expect(link).not.toHaveTextContent("Résumé")
    // Link names are the units' titles, each once.
    const names = [...container.querySelectorAll("a")].map((a) => a.textContent)
    expect(new Set(names).size).toBe(names.length)
  })

  it("on a guide's page: that role's units only, no ids (the guide's own anchors stay as they were)", () => {
    const { container } = render(<DocUnitIndex units={units} role="admin" />)
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/doc/a", "/doc/c"])
    // Besides the filter field (React useId), only the section heading has an id, prefixed so it
    // never matches a heading slug of the guide; the groups get none.
    expect([...container.querySelectorAll("[id]:not(input)")].map((e) => e.id)).toEqual(["doc-toutes-les-fiches"])
    expect(container).not.toHaveTextContent("Pour")
  })

  it("on a guide's page, offers that guide's questions when nothing matches, in its reader's voice", () => {
    render(<DocUnitIndex units={units} role="benevole" />)
    fireEvent.change(screen.getByRole("searchbox", { name: "Filtrer les fiches" }), { target: { value: "xyz" } })
    expect(screen.getByText("Essaie un autre mot, ou efface le filtre pour revoir toute la liste.")).toBeVisible()
    expect(screen.getByText(/^Tu trouveras peut-être ta réponse ici\s:$/)).toBeVisible()
    expect(screen.getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")])).toEqual([["Questions fréquentes", "#faq-du-guide"]])
    cleanup()

    render(<DocUnitIndex units={units} role="admin" />)
    fireEvent.change(screen.getByRole("searchbox", { name: "Filtrer les fiches" }), { target: { value: "xyz" } })
    expect(screen.getByText("Essayez un autre mot, ou effacez le filtre pour revoir toute la liste.")).toBeVisible()
    expect(screen.getByText(/^Vous trouverez peut-être votre réponse ici\s:$/)).toBeVisible()
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["#faq-du-guide", "/doc/aide-et-retours"])
    // The status line stays the only live region.
    expect(screen.getAllByRole("status")).toHaveLength(1)
  })

  it("server-renders the filter at its final size but invisible, gone without script, and the status from the first paint", () => {
    const html = renderToString(<DocUnitIndex units={units} />)
    const doc = new DOMParser().parseFromString(html, "text/html")
    const search = doc.querySelector("search")!
    expect(search.className.split(/\s+/)).toEqual(expect.arrayContaining(["invisible", "noscript:hidden"]))
    // A real field, neither disabled nor hidden from assistive technology by an attribute.
    const field = search.querySelector("input[type=search]")!
    expect(field.hasAttribute("disabled")).toBe(false)
    expect(doc.querySelector("[aria-hidden]")).toBeNull()
    expect(doc.querySelectorAll('[role="status"]')).toHaveLength(1)
    // Once hydrated (a client render), it shows.
    const { container } = render(<DocUnitIndex units={units} />)
    expect(container.querySelector("search")).not.toHaveClass("invisible")
    expect(screen.getByRole("searchbox", { name: "Filtrer les fiches" })).toBeVisible()
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

      // « creneau » without its accent finds b by its question, nothing else; the question links
      // to its heading on b's page, under the result.
      fireEvent.change(field, { target: { value: "CRENEAU changer" } })
      expect(screen.getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
        ["Titre b", "/doc/b"],
        ["Je veux changer de créneau", "/doc/b#je-veux-changer-de-creneau"],
      ])
      expect(screen.getByRole("list", { name: "Questions correspondantes" })).toBeVisible()
      expect(screen.getByRole("link", { name: "Je veux changer de créneau" }).closest("li")!.parentElement!.closest("li")).toHaveTextContent(/^Titre b/)
      expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Après l'inscription"])
      expect(container.querySelector("#inscription")!.parentElement).toHaveAttribute("hidden")
      expect(status).toBeEmptyDOMElement()
      act(() => vi.advanceTimersByTime(300))
      expect(status).toHaveTextContent("1 fiche sur 3 correspond à « CRENEAU changer ».")
      expect(document.activeElement).not.toBe(status)

      // Found by its title: no question under it.
      fireEvent.change(field, { target: { value: "titre b" } })
      expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual(["Titre b"])

      fireEvent.change(field, { target: { value: "xyz" } })
      expect(screen.getByText(/^Un autre mot peut donner des résultats/)).toBeVisible()
      // Next steps, neutral on /doc: both guides' questions and the help unit, nothing else.
      expect(screen.getByText(/^D'autres pistes\s:$/)).toBeVisible()
      expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/doc/benevole#faq-du-guide", "/doc/admin#faq-du-guide", "/doc/aide-et-retours"])
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
