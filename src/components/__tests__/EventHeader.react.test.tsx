/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react"
import EventHeader, { type EventHeaderProps } from "../admin/event-nav/EventHeader"

let segments: string[] = []
let search = new URLSearchParams()
vi.mock("next/navigation", () => ({
  useSelectedLayoutSegments: () => segments,
  useSearchParams: () => search,
  useRouter: () => ({ refresh: vi.fn() }),
}))

const B = "/admin/events/e1"
const props = (over: Partial<EventHeaderProps["facts"]> = {}, rest: Partial<EventHeaderProps> = {}): EventHeaderProps => ({
  facts: { eventId: "e1", publicStatus: "published", startDate: "2030-07-04", endDate: "2030-07-05", today: "2030-06-01", shiftCount: 3, isListed: true, ...over },
  title: "Fête du village",
  dates: "4 au 5 juillet 2030",
  location: "Place de l'église",
  stage: { label: "Publié", className: "" },
  unlisted: false,
  awaitingValidation: false,
  canDelete: false,
  ...rest,
})
const tabs = () => within(screen.getByRole("navigation", { name: "Sections de l'événement" })).getAllByRole("link")

describe("EventHeader: the event's tabs", () => {
  beforeEach(() => { segments = []; search = new URLSearchParams() })
  afterEach(cleanup)

  it("the title is the overview's <h1>, a plain line elsewhere", () => {
    render(<EventHeader {...props()} />)
    expect(screen.getByRole("heading", { level: 1, name: "Fête du village" })).toHaveAttribute("id", "page-heading")
    cleanup()
    segments = ["shifts"]
    render(<EventHeader {...props()} />)
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
    expect(screen.getByText("Fête du village")).not.toHaveAttribute("id")
  })

  it("marks the current tab with aria-current, page on its first page, true on another", () => {
    segments = ["shifts"]
    const { rerender } = render(<EventHeader {...props()} />)
    expect(tabs().map((l) => l.textContent)).toEqual(["Aperçu", "Créneaux", "Inscriptions", "Messages", "Partage", "Documents", "Paramètres de l'événement"])
    expect(tabs().find((l) => l.textContent === "Créneaux")).toHaveAttribute("aria-current", "page")
    expect(tabs().filter((l) => l.hasAttribute("aria-current"))).toHaveLength(1)
    segments = ["staffing", "search"]
    rerender(<EventHeader {...props()} />)
    const shifts = tabs().find((l) => l.textContent === "Créneaux")!
    expect(shifts).toHaveAttribute("aria-current", "true")
    // The tab's own pages, the parent of the nested page marked too.
    const sub = screen.getByRole("navigation", { name: "Pages de la section Créneaux" })
    expect(within(sub).getByRole("link", { name: "Où manque-t-il du monde ?" })).toHaveAttribute("aria-current", "true")
  })

  it("every tab is a link in reading order, none taken out of the tab sequence", () => {
    render(<EventHeader {...props()} />)
    for (const link of tabs()) {
      expect(link).not.toHaveAttribute("tabindex")
      link.focus()
      expect(link).toHaveFocus()
    }
  })

  it("shows « Jour J » from the day before, with « Ouvrir le jour J » as the primary action", () => {
    render(<EventHeader {...props({ today: "2030-07-03" })} />)
    expect(tabs()[1]).toHaveTextContent("Jour J")
    expect(screen.getByRole("link", { name: "Ouvrir le jour J" })).toHaveAttribute("href", `${B}/day-of`)
  })

  it("no « Publier » on step 2 of the creation assistant, which has its own « Continuer » (#1098)", () => {
    segments = ["shifts"]
    search = new URLSearchParams("wizard=1")
    render(<EventHeader {...props({ publicStatus: "draft" })} />)
    expect(screen.queryByRole("button", { name: /Publier/ })).toBeNull()
    cleanup()
    search = new URLSearchParams()
    render(<EventHeader {...props({ publicStatus: "draft" })} />)
    expect(screen.getByRole("button", { name: /Publier/ })).toBeInTheDocument()
  })

  it("one primary action, gone on the page it leads to", () => {
    render(<EventHeader {...props()} />)
    expect(screen.getByRole("link", { name: "Partager le lien" })).toHaveAttribute("href", `${B}/share`)
    cleanup()
    segments = ["share"]
    render(<EventHeader {...props()} />)
    expect(screen.queryByRole("link", { name: "Partager le lien" })).toBeNull()
    cleanup()
    segments = []
    render(<EventHeader {...props({ publicStatus: "draft" })} />)
    expect(screen.getByRole("button", { name: "Publier" })).toBeInTheDocument()
  })
})

describe("EventHeader: « Autres actions »", () => {
  beforeEach(() => { segments = []; search = new URLSearchParams() })
  afterEach(cleanup)

  it("a disclosure: opens without moving the focus, Escape closes it and returns to the button", () => {
    render(<EventHeader {...props()} />)
    const button = screen.getByRole("button", { name: "Autres actions" })
    expect(button).toHaveAttribute("aria-expanded", "false")
    expect(button).not.toHaveAttribute("aria-controls")
    button.focus()
    fireEvent.click(button)
    expect(button).toHaveAttribute("aria-expanded", "true")
    const panel = document.getElementById(button.getAttribute("aria-controls")!)!
    // Right after the button in the reading order.
    expect(button.nextElementSibling).toBe(panel)
    expect(button).toHaveFocus()
    expect(within(panel).getByRole("link", { name: "Journal" })).toHaveAttribute("href", `${B}/log`)
    expect(within(panel).getByRole("link", { name: "Dupliquer" })).toHaveAttribute("href", `${B}/duplicate`)
    within(panel).getByRole("link", { name: "Journal" }).focus()
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(button).toHaveAttribute("aria-expanded", "false")
    expect(button).toHaveFocus()
  })

  it("Escape in the archive confirmation cancels it and keeps the panel open", () => {
    render(<EventHeader {...props()} />)
    const button = screen.getByRole("button", { name: "Autres actions" })
    fireEvent.click(button)
    fireEvent.click(screen.getByRole("button", { name: "Archiver" }))
    const dialog = screen.getByRole("alertdialog", { name: "Archiver cet événement ?" })
    expect(within(dialog).getByRole("button", { name: "Confirmer" })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(button).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Archiver" })).toHaveFocus()
  })

  it("Dépublier for a published event, its confirmation described and focused", () => {
    render(<EventHeader {...props()} />)
    fireEvent.click(screen.getByRole("button", { name: "Autres actions" }))
    fireEvent.click(screen.getByRole("button", { name: "Dépublier" }))
    const dialog = screen.getByRole("alertdialog", { name: "Dépublier ?" })
    expect(dialog).toHaveAccessibleDescription(/repasse en brouillon/)
    expect(within(dialog).getByRole("button", { name: "Confirmer" })).toHaveFocus()
  })

  it("the permanent deletion only for an owner once archived, at the bottom", () => {
    render(<EventHeader {...props({ publicStatus: "archived" }, { canDelete: true })} />)
    fireEvent.click(screen.getByRole("button", { name: "Autres actions" }))
    expect(screen.queryByRole("button", { name: "Archiver" })).toBeNull()
    // An archived event can be published again from here.
    expect(screen.getByRole("button", { name: "Publier" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Supprimer définitivement…" })).toHaveAttribute("href", `${B}/edit#suppression-definitive`)
    cleanup()
    render(<EventHeader {...props({ publicStatus: "archived" })} />)
    fireEvent.click(screen.getByRole("button", { name: "Autres actions" }))
    expect(screen.queryByRole("link", { name: /Supprimer/ })).toBeNull()
  })
})
