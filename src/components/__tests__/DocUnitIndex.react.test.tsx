/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { act, render, screen, cleanup, within, fireEvent } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import MiniSearch from "minisearch"
import DocUnitIndex, { docIndexVersion } from "../public/DocUnitIndex"
import type { DocUnit } from "@/lib/doc-units"
import { DOC_INDEX_OPTIONS, docSearchDocuments } from "@/lib/doc-search-index"

/** The default title of a fixture unit, long enough that no word is a one-letter token. */
const TITLES: Record<string, string> = { a: "Titre alpha", b: "Titre bravo", c: "Titre charlie" }

function unit(slug: string, overrides: Partial<DocUnit> = {}): DocUnit {
  return {
    slug,
    title: TITLES[slug] ?? `Titre ${slug}`,
    roles: ["benevole"],
    group: "apres-inscription",
    order: 10,
    summary: `Résumé de ${slug}.`,
    related: [],
    legacy: [],
    aliases: [],
    body: "Texte.\n",
    source: `content/guide/${slug}.md`,
    ...overrides,
  }
}

const units = [
  unit("b", { body: "## Questions fréquentes\n\n### Je veux changer de créneau\n\nTexte.\n" }),
  unit("a", { group: "inscription", roles: ["admin", "benevole"] }),
  unit("c", { roles: ["admin"] }),
]

/** The JSON index /api/public/doc-index gives for these units. */
const indexJson = (list: readonly DocUnit[]) => {
  const index = new MiniSearch(DOC_INDEX_OPTIONS)
  index.addAll(docSearchDocuments(list))
  return JSON.stringify(index)
}

/** A fetch that answers the index route with these units. */
const indexFetch = (list: readonly DocUnit[]) => vi.fn().mockResolvedValue({ ok: true, text: async () => indexJson(list) })

// #649: the index of the documentation units, on /doc (every unit) and on a guide's page (its role's).
describe("DocUnitIndex", () => {
  // The component may request the index on interaction; a test that cares stubs its own.
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})))
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("on /doc: every unit by group, as headings and lists, the group headings anchored, who each unit is for", () => {
    const { container } = render(<DocUnitIndex units={units} />)
    expect(screen.getByRole("heading", { level: 2, name: "Toutes les fiches" })).toBeInTheDocument()
    const groups = screen.getAllByRole("heading", { level: 3 })
    expect(groups.map((h) => [h.textContent, h.id])).toEqual([
      ["S'inscrire à un créneau", "inscription"],
      ["Après l'inscription", "apres-inscription"],
    ])
    const lists = screen.getAllByRole("list")
    expect(within(lists[0]).getByRole("link", { name: "Titre alpha" })).toHaveAttribute("href", "/doc/a")
    expect(within(lists[1]).getAllByRole("link").map((l) => l.textContent)).toEqual(["Titre bravo", "Titre charlie"])
    // The title link on its own line, then the summary (and who it is for) below it, not in the link.
    const link = within(lists[0]).getByRole("link", { name: "Titre alpha" })
    const summary = link.nextElementSibling!
    expect(summary).toHaveClass("block", "text-sm")
    expect(summary).toHaveTextContent(/^Résumé de a\. Pour\s: organisateurs, bénévoles\.$/)
    expect(link).not.toHaveTextContent("Résumé")
    // Link names are the units' titles, each once.
    const names = [...container.querySelectorAll("a")].map((a) => a.textContent)
    expect(new Set(names).size).toBe(names.length)
  })

  it("labels a recent unit « Nouveau » or « Mis à jour » in its link, and the filter still finds it by title (#763)", () => {
    const now = new Date("2026-10-10T12:00:00Z")
    render(<DocUnitIndex units={[unit("a", { title: "Titre alpha", freshness: { added: "2026-10-01" } }), unit("b", { title: "Titre beta", freshness: { updated: "2026-10-09" } }), unit("c", { title: "Titre gamma", freshness: { added: "2026-10-01", hidden: true } })]} now={now} />)
    expect(screen.getByRole("link", { name: /^Titre alpha,\s?Nouveau$/ })).toHaveAttribute("href", "/doc/a")
    expect(screen.getByRole("link", { name: /^Titre beta,\s?Mis à jour$/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Titre gamma" })).toBeInTheDocument()
    // The label is no part of what the filter searches: typing the title still finds the unit.
    fireEvent.change(screen.getByLabelText("Filtrer les fiches"), { target: { value: "Titre alpha" } })
    expect(screen.getByRole("link", { name: /^Titre alpha,\s?Nouveau$/ }).closest("li")).not.toHaveAttribute("hidden")
    expect(screen.getByRole("link", { name: /^Titre beta,\s?Mis à jour$/, hidden: true }).closest("li")).toHaveAttribute("hidden")
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

  it("shows every group when only stop words remain, as for a blank query, and still says the result", async () => {
    const { container } = render(<DocUnitIndex units={units} />)
    const field = screen.getByRole("searchbox", { name: "Filtrer les fiches" })

    fireEvent.change(field, { target: { value: "le la" } })
    expect(screen.getAllByRole("link")).toHaveLength(3)
    expect(screen.queryByRole("heading", { name: "Résultats" })).toBeNull()
    expect(container.querySelector("#inscription")!.parentElement).not.toHaveAttribute("hidden")
    expect(await screen.findByText("3 fiches sur 3 correspondent à « le la ».")).toBeVisible()
  })

  it("does not fetch the index on page load, then once on the first focus or the first keystroke", () => {
    const fetchMock = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal("fetch", fetchMock)
    const { unmount } = render(<DocUnitIndex units={units} />)
    expect(fetchMock).not.toHaveBeenCalled()

    const field = screen.getByRole("searchbox", { name: "Filtrer les fiches" })
    fireEvent.focus(field)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/public\/doc-index\?v=[0-9a-f]{12}$/))
    // Another focus and the first keystroke don't request it again.
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: "titre bravo" } })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // A keystroke before any focus also requests it, exactly once.
    unmount()
    const keystrokeFetch = vi.fn(() => new Promise(() => {}))
    vi.stubGlobal("fetch", keystrokeFetch)
    render(<DocUnitIndex units={units} />)
    fireEvent.change(screen.getByRole("searchbox", { name: "Filtrer les fiches" }), { target: { value: "titre bravo" } })
    expect(keystrokeFetch).toHaveBeenCalledTimes(1)
    expect(keystrokeFetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/public\/doc-index\?v=[0-9a-f]{12}$/))
  })

  it("matches a body-only word once the index arrives, re-evaluating the query already typed", async () => {
    const local = [
      unit("body", { group: "inscription", title: "Une fiche", summary: "Un résumé qui ne parle pas de cela.", body: "Le texte contient le mot rappel.\n\n## Une autre section\n\nTexte.\n" }),
      unit("other", { group: "inscription", title: "Autre fiche", summary: "Un résumé différent." }),
    ]
    let resolveIndex!: (value: unknown) => void
    const fetchMock = vi.fn(() => new Promise((resolve) => { resolveIndex = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    render(<DocUnitIndex units={local} />)
    const field = screen.getByRole("searchbox", { name: "Filtrer les fiches" })

    // Before the answer, the title, summary and headings alone are searched: no body match.
    fireEvent.change(field, { target: { value: "rappel" } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("link", { name: "Une fiche" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Autre fiche" })).toBeNull()

    // When it arrives, the same query is evaluated again, with the body words and the ranking.
    await act(async () => {
      resolveIndex({ ok: true, text: async () => indexJson(local) })
    })
    expect(await screen.findByRole("link", { name: "Une fiche" })).toBeVisible()
    expect(screen.queryByRole("link", { name: "Autre fiche" })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("keeps filtering on title, summary and headings when the index fails to load, without retrying", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)
    render(<DocUnitIndex units={units} />)
    const field = screen.getByRole("searchbox", { name: "Filtrer les fiches" })

    fireEvent.change(field, { target: { value: "titre bravo" } })
    expect(await screen.findByRole("link", { name: "Titre bravo" })).toBeVisible()
    fireEvent.change(field, { target: { value: "titre alpha" } })
    expect(await screen.findByRole("link", { name: "Titre alpha" })).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // The failure is silent: the status line stays the only live text, and it still speaks.
    expect(screen.getAllByRole("status")).toHaveLength(1)
  })

  it("renders nothing for a role without any unit", () => {
    const { container } = render(<DocUnitIndex units={[unit("b")]} role="admin" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("filters the units on their title, summary, headings and body, hides empty groups and says the result once the reader pauses", () => {
    vi.useFakeTimers()
    try {
      const { container } = render(<DocUnitIndex units={units} />)
      const status = screen.getByRole("status")
      expect(status).toBeEmptyDOMElement()
      const field = screen.getByRole("searchbox", { name: "Filtrer les fiches" })
      expect(field).toHaveAttribute("autocomplete", "off")
      expect(field).toHaveAttribute("enterkeyhint", "search")
      expect(field.closest("form")).toBeNull()

      // « creneau » without its accent finds b by a « ### » heading, nothing else; the heading
      // links to its anchor on b's page, under the result.
      fireEvent.change(field, { target: { value: "CRENEAU changer" } })
      expect(screen.getAllByRole("link").map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
        ["Titre bravo", "/doc/b"],
        ["Je veux changer de créneau", "/doc/b#je-veux-changer-de-creneau"],
      ])
      expect(screen.getByRole("list", { name: "Sections correspondantes" })).toBeVisible()
      expect(screen.getByRole("link", { name: "Je veux changer de créneau" }).closest("li")!.parentElement!.closest("li")).toHaveTextContent(/^Titre bravo/)
      // One list while filtering: a visually hidden « Résultats » heading, the groups hidden.
      expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Résultats"])
      expect(container.querySelector("#inscription")!.parentElement).toHaveAttribute("hidden")
      expect(status).toBeEmptyDOMElement()
      act(() => vi.advanceTimersByTime(300))
      expect(status).toHaveTextContent("1 fiche sur 3 correspond à « CRENEAU changer ».")
      expect(document.activeElement).not.toBe(status)

      // Found by its title: no section under it.
      fireEvent.change(field, { target: { value: "titre bravo" } })
      expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual(["Titre bravo"])

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

  it("finds a unit by its body, links its matching sections, and orders a group by relevance", async () => {
    const local = [
      unit("body", {
        group: "inscription",
        title: "Titre body",
        summary: "Résumé de body.",
        body: "Le texte parle de rappel et de créneau.\n\n## Rappels envoyés\n\nTexte.\n",
      }),
      unit("title", { group: "inscription", title: "Créneau et rappel" }),
      unit("summary", { group: "inscription", title: "Titre summary", summary: "Un résumé sur le créneau." }),
    ]
    vi.stubGlobal("fetch", indexFetch(local))
    render(<DocUnitIndex units={local} />)
    const field = screen.getByRole("searchbox", { name: "Filtrer les fiches" })

    // Title, then heading, then summary, then body: ties keep the original order.
    fireEvent.change(field, { target: { value: "creneau" } })
    await act(async () => {})
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Créneau et rappel", "Titre summary", "Titre body"])

    // Found by its body, the unit lists its matching « ## » heading as a link to its anchor.
    fireEvent.change(field, { target: { value: "rappel" } })
    expect(screen.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Créneau et rappel", "/doc/title"],
      ["Titre body", "/doc/body"],
      ["Rappels envoyés", "/doc/body#rappels-envoyes"],
    ])
    expect(screen.getByRole("list", { name: "Sections correspondantes" })).toBeVisible()
  })

  it("shows one ranked list across groups while filtering, with each unit's group, then restores the groups", async () => {
    const local = [
      unit("body", {
        group: "inscription",
        title: "Fiche du texte",
        summary: "Résumé du texte.",
        body: "Le texte parle de rappel.\n\n## Une section\n\nTexte.\n",
      }),
      unit("title", { group: "apres-inscription", title: "Créneau et rappel", summary: "Résumé du titre." }),
    ]
    vi.stubGlobal("fetch", indexFetch(local))
    const { container } = render(<DocUnitIndex units={local} />)
    // The server-rendered grouped list, and no « Résultats » heading while no query is typed.
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["S'inscrire à un créneau", "Après l'inscription"])
    expect(screen.queryByRole("heading", { name: "Résultats" })).toBeNull()

    const field = screen.getByRole("searchbox", { name: "Filtrer les fiches" })
    fireEvent.change(field, { target: { value: "rappel" } })
    await act(async () => {})

    // One list, the best unit first although it sits in the second group, each with its group name.
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Résultats"])
    const results = screen.getByRole("heading", { name: "Résultats" }).nextElementSibling as HTMLElement
    expect(within(results).getAllByRole("link").map((link) => link.textContent)).toEqual(["Créneau et rappel", "Fiche du texte"])
    expect(screen.getByText(/^Rubrique\s*:\s*Après l'inscription$/)).toBeVisible()
    expect(screen.getByText(/^Rubrique\s*:\s*S'inscrire à un créneau$/)).toBeVisible()
    expect(container.querySelector("#inscription")!.parentElement).toHaveAttribute("hidden")
    expect(container.querySelector("#apres-inscription")!.parentElement).toHaveAttribute("hidden")

    // A query nothing matches brings the empty state, not an empty list.
    fireEvent.change(field, { target: { value: "xyzzy" } })
    expect(screen.getByText(/^Un autre mot peut donner des résultats/)).toBeVisible()
    expect(screen.queryByRole("heading", { name: "Résultats" })).toBeNull()

    // Échap clears the field, restores the groups and leaves the focus where it was.
    field.focus()
    fireEvent.keyDown(field, { key: "Escape" })
    expect(field).toHaveValue("")
    expect(field).toHaveFocus()
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["S'inscrire à un créneau", "Après l'inscription"])
    expect(screen.queryByRole("heading", { name: "Résultats" })).toBeNull()
    expect(screen.getByRole("link", { name: "Créneau et rappel" })).toBeVisible()
  })
})

describe("docIndexVersion", () => {
  const unit = { slug: "rappels", title: "Rappels", summary: "Les rappels.", body: "## Avant\n\nTexte." } as Parameters<typeof docIndexVersion>[0][number]
  it("is stable for the same guides and changes with any guide's content", () => {
    expect(docIndexVersion([unit])).toBe(docIndexVersion([{ ...unit }]))
    expect(docIndexVersion([unit])).toMatch(/^[0-9a-f]{12}$/)
    expect(docIndexVersion([{ ...unit, body: unit.body + " Ajout." }])).not.toBe(docIndexVersion([unit]))
  })
})
