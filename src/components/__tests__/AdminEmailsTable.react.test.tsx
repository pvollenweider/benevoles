// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach } from "vitest"
import "@testing-library/jest-dom/vitest"
import { render, screen, cleanup, within } from "@testing-library/react"

import AdminEmailsTable, { type AdminEmailDisplayRow } from "../super-admin/AdminEmailsTable"

const row = (over: Partial<AdminEmailDisplayRow> = {}): AdminEmailDisplayRow => ({
  dateTime: "2026-11-26",
  dateLabel: "26 novembre 2026",
  kindLabel: "Résumé quotidien des adresses à vérifier",
  accepted: 3,
  failed: 0,
  ...over,
})

function renderSection(props: { rows?: AdminEmailDisplayRow[]; days?: number; zone?: string; truncated?: boolean; unavailable?: boolean } = {}) {
  return render(
    <AdminEmailsTable
      rows={props.rows ?? [row()]}
      days={props.days ?? 30}
      zone={props.zone ?? "Jours en heure de Zurich."}
      truncated={props.truncated ?? false}
      unavailable={props.unavailable ?? false}
    />,
  )
}

/** The cells of the data row whose row header is the given date. */
function cellsOf(dateTime: string): HTMLElement[] {
  const header = screen.getByRole("rowheader", { name: /novembre 2026/ })
  expect(header.querySelector("time")).toHaveAttribute("dateTime", dateTime)
  return within(header.closest("tr") as HTMLElement).getAllByRole("cell")
}

describe("AdminEmailsTable", () => {
  afterEach(cleanup)

  it("names the section and the table by the heading, and the scroll region by itself", () => {
    renderSection()

    const heading = screen.getByRole("heading", { level: 2, name: "Emails envoyés aux administrateurs" })
    expect(heading).toBeInTheDocument()
    // The named <section> is itself a region; the scrollable wrapper has its own name.
    const section = screen.getByRole("region", { name: "Emails envoyés aux administrateurs" })
    expect(section.tagName).toBe("SECTION")
    const region = screen.getByRole("region", { name: "Tableau des emails envoyés aux administrateurs" })
    expect(region).toHaveAttribute("tabindex", "0")
    expect(region).toHaveClass("overflow-x-auto")
    expect(region).not.toHaveClass("overflow-hidden")

    const table = screen.getByRole("table", { name: "Emails envoyés aux administrateurs" })
    const headers = within(table).getAllByRole("columnheader")
    expect(headers.map((h) => h.textContent)).toEqual([
      "Date",
      "Type d'email",
      "Acceptés par le serveur d'envoi",
      "Refusés ou en échec",
    ])
    for (const header of headers) expect(header).toHaveAttribute("scope", "col")
  })

  it("puts the date and the kind in row headers, the date in a time element", () => {
    renderSection()

    const header = screen.getByRole("rowheader", { name: "26 novembre 2026" })
    expect(header.tagName).toBe("TH")
    expect(header).toHaveAttribute("scope", "row")
    expect(header).toHaveClass("font-normal", "whitespace-nowrap")
    const time = header.querySelector("time")
    expect(time).toHaveAttribute("dateTime", "2026-11-26")
    expect(time).toHaveTextContent("26 novembre 2026")

    const kind = screen.getByRole("rowheader", { name: "Résumé quotidien des adresses à vérifier" })
    expect(kind.tagName).toBe("TH")
    expect(kind).toHaveAttribute("scope", "row")
    expect(kind).toHaveClass("font-normal", "text-left")
  })

  it("shows zero as the digit 0, without emphasis", () => {
    renderSection({ rows: [row({ accepted: 0, failed: 0 })] })

    const cells = cellsOf("2026-11-26")
    const accepted = cells.at(-2) as HTMLElement
    const failed = cells.at(-1) as HTMLElement
    expect(accepted).toHaveTextContent(/^0$/)
    expect(failed).toHaveTextContent(/^0$/)
    expect(failed).not.toHaveClass("text-red-700")
    expect(failed).not.toHaveClass("font-medium")
  })

  it("emphasises a refused count above zero and nothing else", () => {
    renderSection({ rows: [row({ accepted: 2, failed: 3 })] })

    const cells = cellsOf("2026-11-26")
    const accepted = cells.at(-2) as HTMLElement
    const failed = cells.at(-1) as HTMLElement
    expect(accepted).toHaveTextContent("2")
    expect(accepted).not.toHaveClass("text-red-700")
    expect(failed).toHaveTextContent("3")
    expect(failed).toHaveClass("font-medium", "text-red-700")
  })

  it("keeps the section and heading, without a table, when there is no email", () => {
    renderSection({ rows: [] })

    expect(screen.getByRole("heading", { level: 2, name: "Emails envoyés aux administrateurs" })).toBeInTheDocument()
    const empty = screen.getByText("Aucun email envoyé aux administrateurs sur cette période.")
    expect(empty.tagName).toBe("P")
    expect(screen.queryByRole("table")).toBeNull()
    // Empty state: the intro keeps only the period sentence and the zone.
    const intro = screen.getByText(/Les 30 derniers jours/)
    expect(intro).toHaveTextContent("Les 30 derniers jours, les plus récents d'abord.")
    expect(intro).toHaveTextContent("Jours en heure de Zurich.")
    expect(intro).not.toHaveTextContent("Un email accepté")
  })

  it("keeps the section and heading, without a table, when the query failed", () => {
    renderSection({ rows: [], unavailable: true })

    expect(screen.getByRole("heading", { level: 2, name: "Emails envoyés aux administrateurs" })).toBeInTheDocument()
    expect(screen.getByText("Ces emails ne peuvent pas être affichés pour le moment.")).toBeInTheDocument()
    expect(screen.queryByRole("table")).toBeNull()
    expect(screen.queryByText("Aucun email envoyé aux administrateurs sur cette période.")).toBeNull()
    const intro = screen.getByText(/Les 30 derniers jours/)
    expect(intro).not.toHaveTextContent("Un email accepté")
  })

  it("introduces the period, the meaning of the numbers and the zone before the table", () => {
    renderSection()

    const intro = screen.getByText(/Les 30 derniers jours, les plus récents d'abord/)
    expect(intro.tagName).toBe("P")
    expect(intro).toHaveTextContent("Un email accepté a été pris en charge par notre serveur d'envoi ; cela ne prouve pas qu'il est arrivé dans la boîte du destinataire.")
    expect(intro).toHaveTextContent("Jours en heure de Zurich.")
    expect(intro).not.toHaveTextContent("Seuls les jours les plus récents")
    expect(intro.compareDocumentPosition(screen.getByRole("table")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("says when only the latest days are shown", () => {
    renderSection({ truncated: true })

    expect(screen.getByText(/Seuls les jours les plus récents sont affichés\./)).toBeInTheDocument()
  })
})
