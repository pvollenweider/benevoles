/**
 * @vitest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The dynamic import of Chart.js can fail (chunk blocked, network cut). The chart must say so and
// leave the table as the source of truth, never an empty canvas (#1415).

vi.mock("chart.js", () => {
  throw new Error("chunk failed to load")
})

import { bubbleChartData, type BubbleEventFacts } from "@/lib/operator-activity"
import OperatorBubbleChart from "@/components/super-admin/OperatorBubbleChart"

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

const event: BubbleEventFacts = {
  id: "event-1",
  title: "Fête du village",
  organizationName: "Fête",
  publicStatus: "published",
  isListed: true,
  startDate: day("2026-07-10"),
  endDate: day("2026-07-10"),
  shifts: 2,
  registrations: 5,
  roles: 1,
}

afterEach(cleanup)

describe("operator bubble chart import failure", () => {
  it("renders the fallback sentence instead of the canvas", async () => {
    render(
      <OperatorBubbleChart
        data={bubbleChartData([event], new Date("2026-07-10T09:00:00Z"))}
        labelId="operator-bubble-encoding"
      />,
    )

    expect(await screen.findByText("Le graphique n'a pas pu être chargé ; le résumé et le tableau « Par situation » restent affichés.")).toBeInTheDocument()
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
  })
})
