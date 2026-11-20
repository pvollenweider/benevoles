/**
 * @vitest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import OperatorLoadChart from "@/components/super-admin/OperatorLoadChart"
import type { LoadDay, LoadEvent, OperatorLoadData } from "@/lib/operator-load"

// The client « Charge par jour » chart (#1415): default range and today selection, range switch,
// the HTML period buttons over the visual SVG, roving keyboard focus, previous/next, the live
// announcement, event detail and back, the tooltip and an empty range. The pure bucketing and axes
// are covered by src/lib/__tests__/operator-load.test.ts.

const TODAY = "2026-07-10"

const event = (over: Partial<LoadEvent> = {}): LoadEvent => ({
  id: "e1",
  title: "Fête du village",
  organizationName: "Fête",
  organizationSlug: "fete",
  startDate: TODAY,
  endDate: TODAY,
  archived: false,
  shifts: 5,
  capacity: 10,
  registrations: 4,
  ...over,
})

const day = (over: Partial<LoadDay> = {}): LoadDay => ({
  day: TODAY,
  eventId: "e1",
  shifts: 2,
  capacity: 4,
  registrations: 2,
  ...over,
})

const data: OperatorLoadData = {
  today: TODAY,
  events: [
    event(),
    event({ id: "e2", title: "Festival du lac", organizationName: "Lac", organizationSlug: "lac", startDate: "2026-07-11", endDate: "2026-07-11", shifts: 3, capacity: 6, registrations: 2 }),
    event({
      id: "e3",
      title: "Vieille fête",
      organizationName: "Vieux",
      organizationSlug: "vieux",
      startDate: "2026-06-01",
      endDate: TODAY,
      archived: true,
      shifts: 1,
      capacity: 2,
      registrations: 1,
    }),
  ],
  days: [
    day(),
    day({ day: "2026-07-05", shifts: 3, capacity: 6, registrations: 2 }),
    day({ day: "2026-07-11", eventId: "e2", shifts: 3, capacity: 6, registrations: 2 }),
    day({ day: TODAY, eventId: "e3", shifts: 1, capacity: 2, registrations: 1 }),
  ],
}

const empty: OperatorLoadData = { today: TODAY, events: [], days: [] }

const PERIOD_GROUP = /^Périodes : flèches gauche et droite pour se déplacer, Entrée pour afficher le détail$/

afterEach(cleanup)

function todayBar() {
  return screen.getByRole("button", { name: /^vendredi 10 juillet \(aujourd'hui\) : 3 créneaux, 2 événements, 3 inscrits/ })
}

function liveRegion(): HTMLElement {
  return document.querySelector('[aria-live="polite"]')!
}

describe("operator load chart", () => {
  it("opens on « Un mois » with today selected and its period detail", () => {
    const { container } = render(<OperatorLoadChart data={data} />)

    const rangeGroup = screen.getByRole("group", { name: "Période affichée" })
    expect(within(rangeGroup).getAllByRole("button").map((button) => button.textContent)).toEqual(["Une semaine", "Un mois", "6 mois", "Un an"])
    expect(within(rangeGroup).getByRole("button", { name: "Un mois" })).toHaveAttribute("aria-pressed", "true")
    expect(within(rangeGroup).getByRole("button", { name: "Une semaine" })).toHaveAttribute("aria-pressed", "false")

    // The drawing itself is purely visual; the periods are real HTML buttons over the plot.
    expect(screen.queryByRole("img")).toBeNull()
    const svg = container.querySelector('svg[viewBox="0 0 900 340"]')
    expect(svg).toHaveAttribute("aria-hidden", "true")
    expect(svg!.querySelector('[role="button"]')).toBeNull()

    const periods = screen.getByRole("group", { name: PERIOD_GROUP })
    expect(within(periods).getAllByRole("button")).toHaveLength(62)
    expect(periods).toHaveAccessibleDescription(/Les barres empilées donnent les créneaux par jour.*du 9 juin 2026 au 9 août 2026/)
    expect(todayBar()).toHaveAttribute("aria-pressed", "true")
    expect(todayBar()).toHaveAttribute("tabindex", "0")
    // The transparent button draws its own visible focus ring, even over a coloured bar.
    expect(todayBar()).toHaveClass("focus-visible:outline-blue-600", "focus-visible:ring-white")
    expect(liveRegion()).toHaveTextContent("")

    const heading = screen.getByRole("heading", { level: 4, name: "vendredi 10 juillet (aujourd'hui) : 2 événements, 3 créneaux, 3 inscrits" })
    expect(heading).toBeInTheDocument()
    const table = screen.getByRole("table", { name: /Événements avec au moins un créneau ce jour-là/ })
    expect(within(table).getAllByRole("rowheader").map((header) => header.textContent)).toEqual(["Fête du village", "Vieille fête"])
    expect(within(table).getByRole("link", { name: /Fête/ })).toHaveAttribute("href", "/super-admin/organizations/fete")
    expect(within(table).getByText("(archivé)")).toBeInTheDocument()
  })

  it("switches to « Un an », shows weekly bars, the current week and announces the range", () => {
    render(<OperatorLoadChart data={data} />)

    fireEvent.click(screen.getByRole("button", { name: "Un an" }))

    expect(screen.getByRole("button", { name: "Un an" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Un mois" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByText("Créneaux par semaine")).toBeInTheDocument()
    expect(screen.getByRole("group", { name: PERIOD_GROUP })).toHaveAccessibleDescription(/les créneaux par semaine.*du 11 juillet 2025 au 8 juillet 2027/)
    expect(screen.getByRole("group", { name: PERIOD_GROUP })).toHaveAccessibleDescription(/un an de part et d'autre/i)
    expect(screen.getByRole("heading", { level: 4, name: /^Semaine du 10 juil. au 16 juil. 2026 \(semaine en cours\)/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Semaine du 10 juil. au 16 juil. 2026 \(semaine en cours\)/ })).toHaveAttribute("aria-pressed", "true")
    expect(liveRegion()).toHaveTextContent("Un an : 104 semaines")
  })

  it("keeps the qualifier in every period label", () => {
    render(<OperatorLoadChart data={data} />)

    expect(todayBar()).toHaveAccessibleName(/\(aujourd'hui\)/)
    expect(screen.getByRole("button", { name: /^jeudi 9 juillet \(passé\) :/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^samedi 11 juillet :/ })).not.toHaveAccessibleName(/\(passé\)|\(aujourd'hui\)/)

    fireEvent.click(screen.getByRole("button", { name: "Un an" }))
    expect(screen.getByRole("button", { name: /\(semaine en cours\)/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Semaine du 3 juil. au 9 juil. 2026 \(passé\) :/ })).toBeInTheDocument()
  })

  it("moves one tab stop with the arrows and selects with Enter, then announces the heading", () => {
    render(<OperatorLoadChart data={data} />)

    const today = todayBar()
    const tomorrow = screen.getByRole("button", { name: /^samedi 11 juillet : 3 créneaux, 1 événement, 2 inscrits/ })
    expect(today).toHaveAttribute("tabindex", "0")
    expect(tomorrow).toHaveAttribute("tabindex", "-1")

    today.focus()
    fireEvent.keyDown(today, { key: "ArrowRight" })
    expect(tomorrow).toHaveFocus()
    expect(tomorrow).toHaveAttribute("tabindex", "0")
    expect(today).toHaveAttribute("tabindex", "-1")

    fireEvent.keyDown(tomorrow, { key: "Enter" })
    expect(tomorrow).toHaveAttribute("aria-pressed", "true")
    expect(today).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("heading", { level: 4, name: "samedi 11 juillet : 1 événement, 3 créneaux, 2 inscrits" })).toBeInTheDocument()
    expect(liveRegion()).toHaveTextContent("samedi 11 juillet : 1 événement, 3 créneaux, 2 inscrits")

    fireEvent.keyDown(tomorrow, { key: "End" })
    expect(screen.getByRole("button", { name: /^dimanche 9 août/ })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole("button", { name: /^dimanche 9 août/ }), { key: "Home" })
    expect(screen.getByRole("button", { name: /^mardi 9 juin \(passé\)/ })).toHaveFocus()
  })

  it("moves the selection with the previous/next buttons and disables them at the ends", () => {
    render(<OperatorLoadChart data={data} />)

    const previous = screen.getByRole("button", { name: "Période précédente" })
    const next = screen.getByRole("button", { name: "Période suivante" })
    expect(previous).toBeEnabled()
    expect(next).toBeEnabled()
    expect(previous).toHaveClass("min-h-6", "min-w-6")

    fireEvent.click(previous)
    expect(screen.getByRole("heading", { level: 4, name: /^jeudi 9 juillet \(passé\)/ })).toBeInTheDocument()
    expect(todayBar()).toHaveAttribute("aria-pressed", "false")
    expect(liveRegion()).toHaveTextContent("jeudi 9 juillet (passé) : 0 événement, 0 créneau, 0 inscrit")

    fireEvent.click(screen.getByRole("button", { name: /^mardi 9 juin \(passé\)/ }))
    expect(previous).toBeDisabled()
    expect(next).toBeEnabled()

    fireEvent.click(next)
    expect(screen.getByRole("heading", { level: 4, name: /^mercredi 10 juin \(passé\)/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /^dimanche 9 août/ }))
    expect(next).toBeDisabled()
    expect(previous).toBeEnabled()
  })

  it("switches to an event, draws its band and returns to the period", () => {
    const { unmount } = render(<OperatorLoadChart data={data} />)

    // Move the roving focus away first: « Revenir » must reset it to the selected period.
    const today = todayBar()
    today.focus()
    fireEvent.keyDown(today, { key: "ArrowRight" })

    fireEvent.click(screen.getByRole("button", { name: "Fête du village" }))
    const eventHeading = screen.getByRole("heading", { level: 4, name: "Fête du village" })
    expect(eventHeading).toHaveFocus()
    expect(eventHeading).toHaveAttribute("tabindex", "-1")
    expect(eventHeading.className).toContain("focus-visible:outline-blue-600")
    expect(liveRegion()).toHaveTextContent("")
    expect(screen.getByText(/sur tout l'événement : 5 créneaux, 4 inscrits sur 10 places \(40 %\)/)).toBeInTheDocument()
    const table = screen.getByRole("table", { name: /Ses jours sur la période affichée \(un mois de part et d'autre\)/ })
    expect(within(table).getAllByRole("rowheader").map((header) => header.textContent)).toEqual(["dimanche 5 juillet", "vendredi 10 juillet"])

    fireEvent.click(screen.getByRole("button", { name: "Revenir au vendredi 10 juillet" }))
    expect(screen.getByRole("heading", { level: 4, name: /^vendredi 10 juillet \(aujourd'hui\)/ })).toBeInTheDocument()
    expect(todayBar()).toHaveFocus()
    expect(todayBar()).toHaveAttribute("tabindex", "0")
    expect(liveRegion()).toHaveTextContent("")

    // An event that starts before the displayed range gets the « ← » mark in its band label.
    fireEvent.click(screen.getByRole("button", { name: "Vieille fête" }))
    expect(screen.getByRole("heading", { level: 4, name: "Vieille fête" })).toBeInTheDocument()
    unmount()
  })

  it("shows the same figures in the supplementary tooltip, on hover and on focus, and closes on Escape", () => {
    render(<OperatorLoadChart data={data} />)

    expect(screen.queryByRole("tooltip")).toBeNull()
    fireEvent.mouseMove(todayBar(), { clientX: 120, clientY: 200 })
    expect(screen.getByText("Cliquer pour le détail")).toBeInTheDocument()
    expect(screen.getByText("Cliquer pour le détail").parentElement).toHaveTextContent("vendredi 10 juillet")
    expect(screen.getByText("Cliquer pour le détail").parentElement).toHaveTextContent("3 créneaux · 2 événements · 3 inscrits")
    expect(screen.getByText("Cliquer pour le détail").parentElement).toHaveAttribute("aria-hidden", "true")
    expect(screen.queryByRole("tooltip")).toBeNull()

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByText("Cliquer pour le détail")).toBeNull()

    // Reaching a period with the keyboard shows it too; blur hides it.
    const tomorrow = screen.getByRole("button", { name: /^samedi 11 juillet :/ })
    fireEvent.focus(tomorrow)
    expect(screen.getByText("Cliquer pour le détail").parentElement).toHaveTextContent("samedi 11 juillet")
    fireEvent.blur(tomorrow)
    expect(screen.queryByText("Cliquer pour le détail")).toBeNull()

    fireEvent.mouseMove(todayBar(), { clientX: 120, clientY: 200 })
    fireEvent.mouseLeave(todayBar())
    expect(screen.queryByText("Cliquer pour le détail")).toBeNull()
  })

  it("keeps the chart and a zero detail when no event falls in the window", () => {
    render(<OperatorLoadChart data={empty} />)

    expect(screen.getByRole("group", { name: PERIOD_GROUP })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 4, name: "vendredi 10 juillet (aujourd'hui) : 0 événement, 0 créneau, 0 inscrit" })).toBeInTheDocument()
    expect(screen.getByText("Aucun créneau sur cette période.")).toBeInTheDocument()
    expect(screen.getByText("Autres créneaux")).toBeInTheDocument()
  })
})
