/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"

import EventPagesManager, { type EventPagePoste, type EventPageRow } from "../admin/EventPagesManager"

// « Pages personnalisées » (#605): Monter / Descendre keep focus, announce the new position once,
// stay reachable at the ends, and a failed save reverts the order while focus stays on the button.

const fetchMock = vi.fn()

const page = (over: Partial<EventPageRow>): EventPageRow => ({
  id: "p1", slug: "faq", title: "FAQ", content: "", displayOrder: 0, roleNames: [], ...over,
})

const threePages = [
  page({ id: "p1", title: "FAQ", slug: "faq", displayOrder: 0 }),
  page({ id: "p2", title: "Accès", slug: "acces", displayOrder: 1 }),
  page({ id: "p3", title: "Règlement", slug: "reglement", displayOrder: 2 }),
]

function renderManager(
  pages = threePages,
  postes: EventPagePoste[] = [{ name: "Bar", sector: null }, { name: "Accueil", sector: null }],
  sectorsAdopted = false,
) {
  return render(<EventPagesManager eventId="evt-1" initialPages={pages} postes={postes} sectorsAdopted={sectorsAdopted} />)
}

const up = (title: string) => screen.getByRole("button", { name: `Monter la page « ${title} »` })
const down = (title: string) => screen.getByRole("button", { name: `Descendre la page « ${title} »` })
const spoken = () => screen.queryAllByRole("status").filter((e) => e.textContent?.trim())
const order = () => within(screen.getByRole("list", { name: "Ordre des pages" })).getAllByRole("listitem").map((li) => li.textContent)

describe("EventPagesManager, Monter / Descendre (#605)", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("is an ordered list named « Ordre des pages », one item per page", () => {
    renderManager()
    const list = screen.getByRole("list", { name: "Ordre des pages" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(3)
  })

  it("« Modifier » names the page it opens", () => {
    renderManager()
    expect(screen.getByRole("button", { name: "Modifier la page « FAQ »" })).toHaveTextContent("Modifier")
  })

  it("the slug is not gray-400 (#616 contrast fold-in)", () => {
    renderManager()
    const slug = screen.getByText((_, el) => el?.tagName === "P" && (el.textContent ?? "").trim() === "Adresse : /faq")
    expect(slug).not.toHaveClass("text-gray-400")
    expect(slug).toHaveClass("text-gray-600")
  })

  it("Descendre moves the page, keeps focus on the pressed button and announces the new position once", async () => {
    renderManager()
    down("FAQ").focus()
    fireEvent.click(down("FAQ"))

    expect(order()[0]).toContain("Accès")
    expect(order()[1]).toContain("FAQ")
    await waitFor(() => expect(down("FAQ")).toHaveFocus())
    await waitFor(() => expect(spoken()).toHaveLength(1))
    expect(spoken()[0]).toHaveTextContent("Page « FAQ » déplacée en position 2 sur 3.")
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/events/evt-1/pages/reorder",
      expect.objectContaining({ body: JSON.stringify({ pageIds: ["p2", "p1", "p3"] }) }),
    ))
  })

  it("exactly one status text per press, with the position", async () => {
    renderManager()
    fireEvent.click(down("FAQ"))
    await waitFor(() => expect(spoken()).toHaveLength(1))
    expect(spoken()[0]).toHaveTextContent("Page « FAQ » déplacée en position 2 sur 3.")
  })

  it("a press at an end is aria-disabled, sends nothing, says so, and keeps focus", async () => {
    renderManager()
    expect(up("FAQ")).toHaveAttribute("aria-disabled", "true")
    expect(down("Règlement")).toHaveAttribute("aria-disabled", "true")
    expect(up("Accès")).not.toHaveAttribute("aria-disabled")
    for (const b of screen.getAllByRole("button", { name: /^(Monter|Descendre) la page/ })) expect(b).not.toBeDisabled()

    up("FAQ").focus()
    fireEvent.click(up("FAQ"))
    expect(order()[0]).toContain("FAQ")
    expect(up("FAQ")).toHaveFocus()
    await waitFor(() => expect(spoken()).toHaveLength(1))
    expect(spoken()[0]).toHaveTextContent("La page « FAQ » est déjà en première position.")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("two quick presses announce twice and send the final order once the first request ends", async () => {
    let resolveFirst!: (v: unknown) => void
    fetchMock.mockReturnValueOnce(new Promise((r) => { resolveFirst = r }))
    renderManager()

    fireEvent.click(down("FAQ"))
    fireEvent.click(down("FAQ"))
    expect(order().map((t) => t?.trim())[0]).toContain("Accès")
    expect(order()[1]).toContain("Règlement")
    expect(order()[2]).toContain("FAQ")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ pageIds: ["p2", "p1", "p3"] })

    resolveFirst({ ok: true, json: async () => ({ success: true }) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({ pageIds: ["p2", "p3", "p1"] })
  })

  it("a failed save reverts to the confirmed order, shows the alert, and keeps focus on the pressed button", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Erreur serveur" }) })
    renderManager()
    down("FAQ").focus()
    fireEvent.click(down("FAQ"))
    expect(order()[0]).toContain("Accès")

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(
      "L'ordre des pages n'a pas pu être enregistré. L'ordre enregistré est rétabli.",
    ))
    expect(order()[0]).toContain("FAQ")
    expect(order()[1]).toContain("Accès")
    await waitFor(() => expect(down("FAQ")).toHaveFocus())
  })

  it("has move buttons even with a single page (both ends)", () => {
    renderManager([page({ id: "p1", title: "FAQ" })])
    expect(up("FAQ")).toHaveAttribute("aria-disabled", "true")
    expect(down("FAQ")).toHaveAttribute("aria-disabled", "true")
  })
})

// #1324: a page can be attached to postes, as a labelled group of native checkboxes.
describe("EventPagesManager, postes of an information page (#1324)", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const openEdit = (title = "FAQ") => fireEvent.click(screen.getByRole("button", { name: `Modifier la page « ${title} »` }))

  it("is a labelled group of checkboxes, usable at the keyboard, with the public warning as its description", () => {
    renderManager([page({ id: "p1", title: "FAQ", roleNames: ["Bar"] })])
    openEdit()
    const group = screen.getByRole("group", { name: "Pour les bénévoles de ces postes" })
    expect(group.tagName).toBe("FIELDSET")
    expect(group).toHaveAttribute("tabindex", "-1")
    const bar = within(group).getByRole("checkbox", { name: "Bar" })
    expect(bar).toBeChecked()
    bar.focus()
    expect(bar).toHaveFocus()
    expect(bar).toHaveClass("h-6", "w-6")
    expect(within(group).getByRole("checkbox", { name: "Accueil" })).not.toBeChecked()
    // The public warning is visible above « Titre » and part of the group's description.
    const warning = screen.getByText(/Cette page est publique : tout le monde peut lire son titre et son contenu/)
    expect(within(group).getByRole("checkbox", { name: "Bar" })).toBeInTheDocument()
    expect(group.getAttribute("aria-describedby")?.split(" ")).toContain(warning.id)
  })

  it("saves the ticked postes with the page", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "p9", slug: "caisse", title: "Caisse", content: "", displayOrder: 2, roleNames: ["Bar"] }) })
    renderManager([page({ id: "p1", title: "FAQ" })])
    fireEvent.click(screen.getByRole("button", { name: "+ Ajouter une page" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Titre" }), { target: { value: "Caisse" } })
    fireEvent.click(screen.getByRole("checkbox", { name: "Bar" }))
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/events/evt-1/pages",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ title: "Caisse", content: "", roleNames: ["Bar"] }) }),
    ))
  })

  it("keeps a stored name no live poste carries, ticked and listed last as a deleted poste", () => {
    renderManager([page({ id: "p1", title: "FAQ", roleNames: ["Bar", "Accueil"] })], [{ name: "Accueil", sector: null }])
    // Only the live poste counts in the list, never the deleted one.
    expect(screen.getByText("Pour le poste Accueil")).toBeInTheDocument()
    expect(screen.queryByText(/Pour 2 postes/)).not.toBeInTheDocument()
    openEdit()
    expect(screen.getByRole("checkbox", { name: "Accueil" })).toBeChecked()
    const deleted = screen.getByRole("checkbox", { name: "Bar (poste supprimé)" })
    expect(deleted).toBeChecked()
    // Listed after the live poste.
    expect(screen.getAllByRole("checkbox").at(-1)).toBe(deleted)
  })

  it("shows the event's postes grouped by sector when it adopted sectors", () => {
    renderManager([page({ id: "p1", title: "FAQ" })], [{ name: "Bar", sector: "Buvette" }, { name: "Accueil", sector: "Entrées" }], true)
    openEdit()
    const bar = screen.getByRole("group", { name: "Buvette" })
    expect(within(bar).getByRole("checkbox", { name: "Bar" })).toBeInTheDocument()
    expect(within(screen.getByRole("group", { name: "Entrées" })).getByRole("checkbox", { name: "Accueil" })).toBeInTheDocument()
  })

  it("says there is no poste yet instead of an empty fieldset", () => {
    renderManager([page({ id: "p1", title: "FAQ" })], [])
    openEdit()
    expect(screen.queryByRole("group", { name: "Pour les bénévoles de ces postes" })).not.toBeInTheDocument()
    expect(screen.getByText("Cet événement n'a pas encore de poste. Créez des créneaux, puis revenez ici.")).toBeInTheDocument()
  })

  it("on a validation error about the postes, focuses the fieldset rather than the title", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: "Données invalides.", field: "roleNames" }) })
    renderManager([page({ id: "p1", title: "FAQ" })])
    openEdit()
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }))
    const group = screen.getByRole("group", { name: "Pour les bénévoles de ces postes" })
    await waitFor(() => expect(group).toHaveFocus())
    expect(screen.getByRole("textbox", { name: "Titre" })).not.toHaveFocus()
  })
})
