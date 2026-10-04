/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react"

import EventPagesManager, { type EventPageRow } from "../admin/EventPagesManager"

// « Pages personnalisées » (#605): Monter / Descendre keep focus, announce the new position once,
// stay reachable at the ends, and a failed save reverts the order while focus stays on the button.

const fetchMock = vi.fn()

const page = (over: Partial<EventPageRow>): EventPageRow => ({
  id: "p1", slug: "faq", title: "FAQ", content: "", displayOrder: 0, ...over,
})

const threePages = [
  page({ id: "p1", title: "FAQ", slug: "faq", displayOrder: 0 }),
  page({ id: "p2", title: "Accès", slug: "acces", displayOrder: 1 }),
  page({ id: "p3", title: "Règlement", slug: "reglement", displayOrder: 2 }),
]

function renderManager(pages = threePages) {
  return render(<EventPagesManager eventId="evt-1" initialPages={pages} />)
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
