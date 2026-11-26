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

function renderSection(props: { rows?: AdminEmailDisplayRow[]; days?: number; zone?: string; truncated?: boolean } = {}) {
  return render(
    <AdminEmailsTable
      rows={props.rows ?? [row()]}
      days={props.days ?? 30}
      zone={props.zone ?? "Jours en heure de Zurich."}
      truncated={props.truncated ?? false}
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

  it("names the scrollable region and the table by the heading, with four column headers", () => {
    renderSection()

    expect(screen.getByRole("heading", { level: 2, name: "Emails envoyés aux administrateurs" })).toBeInTheDocument()
    // The named <section> is itself a region; the scrollable wrapper is the focusable one.
    const region = screen.getAllByRole("region", { name: "Emails envoyés aux administrateurs" }).find((r) => r.tabIndex === 0)
    expect(region).toBeDefined()
    expect(region).toHaveAttribute("tabindex", "0")
    expect(region).toHaveClass("overflow-x-auto")
    expect(region).not.toHaveClass("overflow-hidden")

    const table = screen.getByRole("table", { name: "Emails envoyés aux administrateurs" })
    const headers = within(table).getAllByRole("columnheader")
    expect(headers.map((h) => h.textContent)).toEqual([
      "Date",
      "Type d'email",
      "Acceptés par le relais",
      "Refusés ou en échec",
    ])
    for (const header of headers) expect(header).toHaveAttribute("scope", "col")
  })

  it("puts the date in a row header as a time element with the right dateTime", () => {
    renderSection()

    const header = screen.getByRole("rowheader", { name: "26 novembre 2026" })
    expect(header.tagName).toBe("TH")
    expect(header).toHaveAttribute("scope", "row")
    expect(header).toHaveClass("font-normal", "whitespace-nowrap")
    const time = header.querySelector("time")
    expect(time).toHaveAttribute("dateTime", "2026-11-26")
    expect(time).toHaveTextContent("26 novembre 2026")
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
  })

  it("introduces the period, the meaning of the numbers and the zone before the table", () => {
    renderSection()

    const intro = screen.getByText(/Les 30 derniers jours, les plus récents d'abord/)
    expect(intro.tagName).toBe("P")
    expect(intro).toHaveTextContent("Les nombres comptent les emails acceptés par le relais d'envoi, pas une preuve de remise.")
    expect(intro).toHaveTextContent("Jours en heure de Zurich.")
    expect(intro).not.toHaveTextContent("Seules les 60 lignes")
    expect(intro.compareDocumentPosition(screen.getByRole("table")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("says when further rows are not shown", () => {
    renderSection({ truncated: true })

    expect(screen.getByText(/Seules les 60 lignes les plus récentes sont affichées ; les suivantes ne le sont pas\./)).toBeInTheDocument()
  })
})
