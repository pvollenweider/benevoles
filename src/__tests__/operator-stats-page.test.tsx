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

// The operator statistics page (#1415, reworked for readability): two h2 groups, an in-page nav,
// short intros with a native calculation disclosure, one merged 10-next-events table, and a
// bubble chart whose accessible alternative is the summary plus a « Par situation » table.

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
    { id: "event-1", organizationName: "Fête", organizationSlug: "fete", title: "Fête du village", startDate: day("2026-07-10"), endDate: day("2026-07-10"), situation: "now", roles: 2, shifts: 4, registrations: 5, capacity: 10, fillPercent: 50 },
    { id: "event-2", organizationName: "Lac", organizationSlug: "lac", title: "Festival du lac", startDate: day("2026-07-13"), endDate: day("2026-07-14"), situation: "soon7", roles: 3, shifts: 6, registrations: 40, capacity: 60, fillPercent: 67 },
    { id: "event-3", organizationName: "Lac", organizationSlug: "lac", title: "Grande fête", startDate: day("2026-09-15"), endDate: day("2026-09-15"), situation: "later", roles: 1, shifts: 2, registrations: 1, capacity: 4, fillPercent: 25 },
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
    items: [
      { id: "server:memory", label: "Mémoire de l'application", level: "ok", detail: "100 Mo sur 1 Go (9,8 %)." },
      { id: "deferred-bounces", label: "Rejets différés", level: "ok", detail: "Dernier passage il y a 5 min : 3 analysés, 1 signalé." },
    ],
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

  it("groups the sections under two h2 headings and links each one from the in-page nav", async () => {
    const tree = await StatsPage()
    render(tree)

    expect(screen.getByRole("heading", { level: 1, name: "Statistiques" })).toHaveAttribute("id", "page-heading")
    expect(screen.getAllByRole("heading").map((heading) => Number(heading.tagName.slice(1)))).toEqual([1, 2, 3, 3, 3, 4, 3, 2, 3, 3, 3, 3, 3])
    expect(screen.getByRole("heading", { level: 2, name: "Charge actuelle" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Croissance et inscription" })).toBeInTheDocument()

    const nav = screen.getByRole("navigation", { name: "Sections de la page" })
    const links = within(nav).getAllByRole("link")
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#stats-events",
      "#stats-activity",
      "#stats-event-size",
      "#stats-next-events",
      "#stats-cumulative",
      "#stats-current",
      "#stats-signup",
      "#stats-signup-source",
      "#stats-past-events",
    ])
    for (const link of links) {
      expect(document.getElementById(link.getAttribute("href")!.slice(1))).toBeInTheDocument()
    }
  })

  it("renders the five event counts as a definition list and keeps the caveats in a native disclosure", async () => {
    const tree = await StatsPage()
    render(tree)

    expect(screen.queryByRole("table", { name: "Événements" })).toBeNull()
    const definitions = screen.getByText("En cours aujourd'hui").closest("dl")!
    const dt = within(definitions).getByText("En cours aujourd'hui")
    expect(dt.tagName).toBe("DT")
    expect(dt.nextElementSibling?.tagName).toBe("DD")
    expect(dt.nextElementSibling).toHaveTextContent("1")

    const summaries = screen.getAllByText(/^Comment ces chiffres sont calculés/)
    expect(summaries.length).toBeGreaterThan(5)
    expect(summaries.every((summary) => summary.tagName === "SUMMARY")).toBe(true)
    // Each disclosure names its section for screen readers, so the controls list tells them apart.
    expect(summaries.some((summary) => summary.textContent === "Comment ces chiffres sont calculés : Activité des inscriptions")).toBe(true)
    expect(new Set(summaries.map((summary) => summary.textContent)).size).toBe(summaries.length)
    // The counter caveat is kept, inside its disclosure rather than in the page intro.
    expect(screen.getByText(/ne baissent jamais/).closest("details")).toBeInTheDocument()
    expect(screen.getByText(/Les décisions comptent sur 12 mois/).closest("details")).toBeInTheDocument()
  })

  it("replaces the per-event bubble table with the summary and a « Par situation » totals table", async () => {
    const tree = await StatsPage()
    const { unmount } = render(tree)

    expect(screen.getByRole("heading", { name: "Taille des événements" })).toBeInTheDocument()
    expect(screen.getByText(bubble.summary)).toBeInTheDocument()
    expect(screen.queryByText("Les mêmes événements en tableau")).toBeNull()
    expect(screen.queryByRole("table", { name: /Événements en cours ou qui commencent dans les 30 jours/ })).toBeNull()

    const totals = screen.getByRole("table", { name: "Nombre d'événements, de créneaux et d'inscriptions par situation" })
    const rows = within(totals).getAllByRole("rowheader")
    expect(rows.map((row) => row.textContent)).toEqual(["●En cours", "▲Début dans les 7 jours", "■Début dans 8 à 30 jours"])
    expect(within(rows[0]).getByText("●")).toHaveAttribute("aria-hidden", "true")
    const firstValues = within(rows[0].closest("tr")!).getAllByRole("cell").map((cell) => cell.textContent)
    expect(firstValues).toEqual(["1", "2", "5"])
    const secondValues = within(rows[1].closest("tr")!).getAllByRole("cell").map((cell) => cell.textContent)
    expect(secondValues).toEqual(["1", "6", "40"])
    const thirdValues = within(rows[2].closest("tr")!).getAllByRole("cell").map((cell) => cell.textContent)
    expect(thirdValues).toEqual(["0", "0", "0"])

    // Named by the encoding (a hidden paragraph, not read twice); the visible summary follows as text.
    const canvas = screen.getByRole("img", { name: "Graphique à bulles : date de début en horizontal, inscriptions en vertical, surface selon le nombre de créneaux." })
    expect(canvas.tagName).toBe("CANVAS")
    expect(canvas).toHaveAttribute("aria-labelledby", "operator-bubble-encoding")
    expect(canvas).not.toHaveAttribute("aria-describedby")
    expect(document.getElementById("operator-bubble-encoding")).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByText("Une bulle par événement ; sa surface suit le nombre de créneaux.")).toBeInTheDocument()

    await waitFor(() => expect(mocks.chartInstances).toHaveLength(1))
    const config = mocks.chartInstances[0] as { data: { datasets: { label: string }[] }; options: { animation: unknown } }
    expect(config.data.datasets.map((dataset) => dataset.label)).toEqual(["En cours", "Début dans les 7 jours", "Début dans 8 à 30 jours"])
    expect(config.options.animation).toBe(false)
    expect(mocks.chartRegister).toHaveBeenCalled()

    unmount()
    expect(mocks.chartDestroy).toHaveBeenCalledTimes(1)
  })

  it("renders one merged event table with the organisation link, the situation and no postes column", async () => {
    const tree = await StatsPage()
    render(tree)

    const table = screen.getByRole("table", { name: /Les 10 prochains événements, avec leur organisation/ })
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Événement",
      "Dates",
      "Situation",
      "Créneaux",
      "Inscriptions",
      "Remplissage",
    ])

    const first = within(table).getByRole("rowheader", { name: /Fête du village/ }).closest("tr")!
    expect(within(first).getByRole("link", { name: /Fête/ })).toHaveAttribute("href", "/super-admin/organizations/fete")
    expect(within(first).getByText("10 juillet 2026")).toBeInTheDocument()
    expect(within(first).getByText("En cours")).toBeInTheDocument()
    expect(within(first).getByText("50 %")).toBeInTheDocument()

    const soon = within(table).getByRole("rowheader", { name: /Festival du lac/ }).closest("tr")!
    expect(within(soon).getByText("Début dans les 7 jours")).toBeInTheDocument()
    expect(within(soon).getByText("13–14 juillet 2026")).toBeInTheDocument()

    const later = within(table).getByRole("rowheader", { name: /Grande fête/ }).closest("tr")!
    expect(within(later).getByText("Début dans plus de 30 jours")).toBeInTheDocument()
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

  it("renders no chart at all when there is no event, only the summary and the totals table", async () => {
    mocks.loadOperatorActivity.mockResolvedValueOnce({ ...operator, bubble: bubbleChartData([], now) })
    const tree = await StatsPage()
    render(tree)

    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(screen.getByText("Aucun événement en cours ou dans les 30 jours.", { selector: "p" })).toBeInTheDocument()
    const totals = screen.getByRole("table", { name: "Nombre d'événements, de créneaux et d'inscriptions par situation" })
    expect(within(totals).getAllByRole("rowheader")).toHaveLength(3)
    expect(within(totals).getAllByRole("cell").every((cell) => cell.textContent === "0")).toBe(true)
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
    // Deferred bounces (#602): its own item, shown in the Service group next to the outbox.
    expect(screen.getByText("Rejets différés")).toBeInTheDocument()
    expect(screen.getByText("Dernier passage il y a 5 min : 3 analysés, 1 signalé.")).toBeInTheDocument()
  })
})
