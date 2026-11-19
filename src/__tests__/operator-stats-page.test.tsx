/**
 * @vitest-environment jsdom
 */
// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  loadOperatorActivity: vi.fn(),
  loadPlatformUsage: vi.fn(),
  loadSignupFacts: vi.fn(),
  loadSignupSources: vi.fn(),
  observePastEvents: vi.fn(),
  loadHealth: vi.fn(),
  chartRegister: vi.fn(),
  chartDestroy: vi.fn(),
  chartInstances: [] as unknown[],
}))

vi.mock("@/auth", () => ({ auth: mocks.auth }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock("@/lib/usage-stats", () => ({ loadPlatformUsage: mocks.loadPlatformUsage, loadSignupFacts: mocks.loadSignupFacts, loadSignupSources: mocks.loadSignupSources }))
vi.mock("@/lib/signup-indicators", () => ({ signupIndicatorRows: vi.fn(() => []) }))
vi.mock("@/lib/signup-source", () => ({ signupSourceRows: vi.fn(() => []) }))
vi.mock("@/lib/past-event-retention-data", () => ({ observePastEvents: mocks.observePastEvents }))
vi.mock("@/lib/past-event-retention", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/past-event-retention")>()
  return { ...actual, pastEventRetentionMode: vi.fn(() => "observe") }
})
vi.mock("@/lib/operator-activity-data", () => ({ loadOperatorActivity: mocks.loadOperatorActivity }))
vi.mock("@/lib/health-data", () => ({ loadHealth: mocks.loadHealth }))
vi.mock("chart.js", () => {
  class Chart {
    static register = mocks.chartRegister
    destroy = mocks.chartDestroy
    constructor(_canvas: unknown, config: unknown) {
      mocks.chartInstances.push(config)
    }
  }
  return { Chart, BubbleController: {}, PointElement: {}, LinearScale: {}, Tooltip: {}, Legend: {} }
})

import { bubbleChartData, type BubbleEventFacts } from "@/lib/operator-activity"
import type { OperatorActivity } from "@/lib/operator-activity-data"
import StatsPage from "@/app/super-admin/stats/page"
import HealthPage from "@/app/super-admin/health/page"

// The operator statistics page (#1415): super-admin only, the visible summary, the canvas as a
// role="img" named by the encoding sentence, the table always present beside it, and the Chart.js instance
// destroyed on unmount.

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

const event = (over: Partial<BubbleEventFacts> = {}): BubbleEventFacts => ({
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
  ...over,
})

const now = new Date("2026-07-10T09:00:00Z")
const bubble = bubbleChartData(
  [
    event({ id: "event-1", title: "Fête du village" }),
    event({ id: "event-2", title: "Festival du lac", organizationName: "Lac", startDate: day("2026-07-13"), endDate: day("2026-07-14"), shifts: 6, registrations: 40, roles: 3 }),
  ],
  now,
)

const operator: OperatorActivity = {
  generatedAt: now,
  counts: { now: 1, startingWithin7: 1, startingWithin30: 1, registrationsOpenNow: 2, registrationOpeningsNext7Days: 0 },
  activity: {
    counts: { lastHour: 2, previousHour: 1, last24h: 10, previous24h: 8, last7d: 50, previous7d: 40 },
    rows: [
      { key: "hour", label: "Dernière heure", current: 2, comparison: { current: 2, previous: 1, delta: 1, percent: 100, direction: "up", text: "en hausse de 100 % par rapport à la période précédente" } },
      { key: "day", label: "Dernières 24 heures", current: 10, comparison: { current: 10, previous: 8, delta: 2, percent: 25, direction: "up", text: "en hausse de 25 % par rapport à la période précédente" } },
      { key: "week", label: "7 derniers jours", current: 50, comparison: { current: 50, previous: 40, delta: 10, percent: 25, direction: "up", text: "en hausse de 25 % par rapport à la période précédente" } },
    ],
    busiestHour: { hour: "2026-07-09T18", count: 12 },
    outboxWaiting: 3,
  },
  nextEvents: [
    { id: "event-1", organizationName: "Fête", title: "Fête du village", startDate: day("2026-07-10"), endDate: day("2026-07-10"), roles: 2, shifts: 4, registrations: 5, capacity: 10, fillPercent: 50 },
  ],
  bubble,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.chartInstances.length = 0
  mocks.auth.mockResolvedValue({ user: { id: "sa-1", role: "super_admin", organizationId: null } })
  mocks.loadOperatorActivity.mockResolvedValue(operator)
  mocks.loadPlatformUsage.mockResolvedValue({ cumulative: [], current: [] })
  mocks.loadSignupFacts.mockResolvedValue({})
  mocks.loadSignupSources.mockResolvedValue([])
  mocks.observePastEvents.mockResolvedValue([])
  mocks.loadHealth.mockResolvedValue({
    items: [{ id: "server:memory", label: "Mémoire de l'application", level: "ok", detail: "100 Mo sur 1 Go (9,8 %)." }],
    version: "2.8.0",
    gitSha: null,
    migrations: null,
    checkedAt: now,
  })
})
afterEach(cleanup)

describe("the operator statistics page", () => {
  it("redirects a signed-out visitor and a non-super-admin, without loading the figures", async () => {
    mocks.auth.mockResolvedValueOnce(null)
    await expect(StatsPage()).rejects.toThrow("NEXT_REDIRECT:/admin/login")
    expect(mocks.loadOperatorActivity).not.toHaveBeenCalled()

    mocks.auth.mockResolvedValueOnce({ user: { id: "admin-1", role: "admin", organizationId: "org-1" } })
    await expect(StatsPage()).rejects.toThrow("NEXT_REDIRECT:/admin/login")
    expect(mocks.loadOperatorActivity).not.toHaveBeenCalled()
  })

  it("renders the summary, the canvas as an image and the same events in a table", async () => {
    const tree = await StatsPage()
    const { unmount } = render(tree)

    expect(screen.getByRole("heading", { name: "Taille des événements" })).toBeInTheDocument()
    expect(screen.getByText(bubble.summary)).toBeInTheDocument()
    expect(screen.getByText("Les mêmes événements en tableau")).toBeInTheDocument()
    const bubbleTable = screen.getByRole("table", { name: /Événements en cours ou qui commencent dans les 30 jours/ })
    expect(within(bubbleTable).getByRole("rowheader", { name: /Fête du village/ })).toBeInTheDocument()
    expect(within(bubbleTable).getByRole("rowheader", { name: /Festival du lac/ })).toBeInTheDocument()
    expect(within(bubbleTable).getByText("▲")).toHaveAttribute("aria-hidden", "true")

    // Named by the encoding (a hidden paragraph, not read twice); the visible summary follows as text.
    const canvas = screen.getByRole("img", { name: "Graphique à bulles : date de début en horizontal, inscriptions en vertical, surface selon le nombre de créneaux." })
    expect(canvas.tagName).toBe("CANVAS")
    expect(canvas).toHaveAttribute("aria-labelledby", "operator-bubble-encoding")
    expect(canvas).not.toHaveAttribute("aria-describedby")
    expect(document.getElementById("operator-bubble-encoding")).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByText("Une bulle par événement ; sa surface suit le nombre de créneaux.")).toBeInTheDocument()
    expect(screen.getByText(bubble.summary)).toBeInTheDocument()

    await waitFor(() => expect(mocks.chartInstances).toHaveLength(1))
    const config = mocks.chartInstances[0] as { data: { datasets: { label: string }[] }; options: { animation: unknown } }
    expect(config.data.datasets.map((dataset) => dataset.label)).toEqual(["En cours", "Début dans les 7 jours", "Début dans 8 à 30 jours"])
    expect(config.options.animation).toBe(false)
    expect(mocks.chartRegister).toHaveBeenCalled()

    unmount()
    expect(mocks.chartDestroy).toHaveBeenCalledTimes(1)
  })

  it("orders the table rows by start date and shows the start date with the shifts count", async () => {
    // The query returns the later event first; the table still reads by start date.
    mocks.loadOperatorActivity.mockResolvedValueOnce({
      ...operator,
      bubble: bubbleChartData(
        [
          event({ id: "event-2", title: "Festival du lac", organizationName: "Lac", startDate: day("2026-07-13"), endDate: day("2026-07-14"), shifts: 6, registrations: 40, roles: 3 }),
          event({ id: "event-1", title: "Fête du village" }),
        ],
        now,
      ),
    })
    const tree = await StatsPage()
    render(tree)

    const bubbleTable = screen.getByRole("table", { name: /Événements en cours ou qui commencent dans les 30 jours/ })
    const rows = within(bubbleTable).getAllByRole("rowheader")
    expect(rows[0]).toHaveTextContent("Fête du village")
    expect(rows[1]).toHaveTextContent("Festival du lac")
    const firstRow = rows[0].closest("tr")!
    expect(within(firstRow).getByText("10 juillet 2026")).toBeInTheDocument()
    expect(within(firstRow).getByText("2")).toBeInTheDocument()
    const secondRow = rows[1].closest("tr")!
    expect(within(secondRow).getByText("13–14 juillet 2026")).toBeInTheDocument()
    expect(within(secondRow).getByText("6")).toBeInTheDocument()
  })

  it("moves the busiest hour and the waiting emails out of the comparison table into a definition list", async () => {
    const tree = await StatsPage()
    render(tree)

    const activityTable = screen.getByRole("table", { name: /Activité des inscriptions et comparaison/ })
    expect(within(activityTable).queryByText("Heure la plus chargée des 7 derniers jours")).not.toBeInTheDocument()
    expect(within(activityTable).queryByText("Emails en attente dans la file d'envoi")).not.toBeInTheDocument()
    const definitions = screen.getByText("Heure la plus chargée des 7 derniers jours").closest("dl")!
    expect(definitions.tagName).toBe("DL")
    expect(within(definitions).getByText("jeudi 9 juillet, de 18h à 19h : 12 inscriptions").tagName).toBe("DD")
    expect(within(definitions).getByText("Emails en attente dans la file d'envoi").tagName).toBe("DT")
    expect(within(definitions).getByText("3").tagName).toBe("DD")
  })

  it("puts the horizontal scroll region on the focusable container itself", async () => {
    const tree = await StatsPage()
    render(tree)

    const region = screen.getByRole("region", { name: "Les 10 prochains événements" })
    expect(region).toHaveAttribute("tabindex", "0")
    expect(region).toHaveClass("overflow-x-auto", "focus-visible:outline", "focus-visible:outline-blue-600")
    expect(region.querySelector("table")).toBeInTheDocument()
    expect(region.className).not.toContain("overflow-hidden")
  })

  it("renders an unknown fill rate as a hidden dash with a spoken explanation", async () => {
    mocks.loadOperatorActivity.mockResolvedValueOnce({ ...operator, nextEvents: [{ ...operator.nextEvents[0], fillPercent: null }] })
    const tree = await StatsPage()
    render(tree)

    expect(screen.getByText("—")).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByText("non calculable, aucune place")).toHaveClass("sr-only")
  })

  it("renders no chart at all when there is no event, only the summary and the table", async () => {
    mocks.loadOperatorActivity.mockResolvedValueOnce({ ...operator, bubble: bubbleChartData([], now) })
    const tree = await StatsPage()
    render(tree)

    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(screen.getByText("Aucun événement en cours ou dans les 30 jours.", { selector: "p" })).toBeInTheDocument()
    expect(screen.getByRole("table", { name: /Événements en cours ou qui commencent dans les 30 jours/ })).toBeInTheDocument()
  })
})

describe("the health page's server section", () => {
  it("is super-admin only and shows the new Serveur group", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: "admin-1", role: "admin", organizationId: "org-1" } })
    await expect(HealthPage()).rejects.toThrow("NEXT_REDIRECT:/admin/login")
    expect(mocks.loadHealth).not.toHaveBeenCalled()

    mocks.auth.mockResolvedValueOnce({ user: { id: "sa-1", role: "super_admin", organizationId: null } })
    const tree = await HealthPage()
    render(tree)
    expect(screen.getByRole("heading", { name: "Serveur" })).toBeInTheDocument()
    expect(screen.getByText("Mémoire de l'application")).toBeInTheDocument()
    expect(screen.getByText("100 Mo sur 1 Go (9,8 %).")).toBeInTheDocument()
  })
})
