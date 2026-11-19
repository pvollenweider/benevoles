// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { buildBubbleChartConfig, bubbleTooltipLines, bubbleTooltipTitle } from "../operator-bubble-chart-config"
import { bubbleChartData, type BubbleEventFacts } from "../operator-activity"

// The Chart.js configuration is pure: each dataset, shape, radius, axis and the tooltip are checked
// without a canvas (the React test mocks chart.js in jsdom).

const at = (iso: string) => new Date(iso)
const day = (iso: string) => at(`${iso}T00:00:00Z`)

const event = (over: Partial<BubbleEventFacts> = {}): BubbleEventFacts => ({
  id: "e1",
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

const data = bubbleChartData(
  [
    event({ id: "now", title: "En cours" }),
    event({ id: "soon7", title: "Dans 7 jours", startDate: day("2026-07-13"), endDate: day("2026-07-13"), shifts: 3, registrations: 8, roles: 2 }),
    event({ id: "soon30", title: "Dans 30 jours", startDate: day("2026-07-20"), endDate: day("2026-07-20"), shifts: 4, registrations: 10, roles: 4 }),
  ],
  at("2026-07-10T09:00:00Z"),
)

describe("bubble chart configuration", () => {
  it("has one dataset per category, distinguished by colour and shape", () => {
    const config = buildBubbleChartConfig(data)
    const datasets = config.data.datasets
    expect(datasets).toHaveLength(3)
    expect(datasets.map((set) => set.label)).toEqual(["En cours", "Début dans les 7 jours", "Début dans 8 à 30 jours"])
    expect(datasets.map((set) => set.pointStyle)).toEqual(["circle", "triangle", "rect"])
    expect(new Set(datasets.map((set) => set.borderColor)).size).toBe(3)
    expect(datasets.map((set) => set.data?.map((point) => point.id))).toEqual([["now"], ["soon7"], ["soon30"]])
  })

  it("plots the real values and the radius from the postes", () => {
    const config = buildBubbleChartConfig(data)
    const now = config.data.datasets[0].data![0]
    expect(now).toMatchObject({ x: 2, y: 5, r: 13, shifts: 2, registrations: 5, roles: 1 })
    const soon30 = config.data.datasets[2].data![0]
    expect(soon30.r).toBe(26)
  })

  it("labels both axes with their unit and keeps integer ticks, naming a cap when there is one", () => {
    const config = buildBubbleChartConfig(data)
    const x = config.options!.scales!.x as { type: string; title: { text: string }; ticks: { precision: number } }
    const y = config.options!.scales!.y as { type: string; title: { text: string }; ticks: { precision: number } }
    expect(x.type).toBe("linear")
    expect(y.type).toBe("linear")
    expect(x.title.text).toBe("Nombre de créneaux")
    expect(y.title.text).toBe("Nombre d'inscriptions")
    expect(x.ticks.precision).toBe(0)

    const capped = bubbleChartData(
      [
        event({ id: "a", shifts: 2, registrations: 5 }),
        event({ id: "b", shifts: 3, registrations: 6 }),
        event({ id: "c", shifts: 4, registrations: 8 }),
        event({ id: "huge", shifts: 1000, registrations: 2000, roles: 20 }),
      ],
      at("2026-07-10T09:00:00Z"),
    )
    const cappedConfig = buildBubbleChartConfig(capped)
    expect((cappedConfig.options!.scales!.x as { title: { text: string } }).title.text).toBe("Nombre de créneaux (plafonné à 5)")
    expect((cappedConfig.options!.scales!.y as { title: { text: string } }).title.text).toBe("Nombre d'inscriptions (plafonné à 10)")
  })

  it("draws a thicker border on a point clamped by a capped axis", () => {
    const capped = bubbleChartData(
      [
        event({ id: "a", shifts: 2, registrations: 5 }),
        event({ id: "b", shifts: 3, registrations: 6 }),
        event({ id: "c", shifts: 4, registrations: 8 }),
        event({ id: "huge", shifts: 1000, registrations: 2000, roles: 20 }),
      ],
      at("2026-07-10T09:00:00Z"),
    )
    const points = buildBubbleChartConfig(capped).data.datasets[0].data!
    const borderWidth = buildBubbleChartConfig(capped).data.datasets[0].borderWidth as (context: { raw: unknown }) => number
    expect(borderWidth({ raw: points.find((point) => point.id === "huge") })).toBe(3)
    expect(borderWidth({ raw: points.find((point) => point.id === "a") })).toBe(1.5)
  })

  it("keeps the legend display-only so a dataset cannot be hidden by mouse", () => {
    const legend = buildBubbleChartConfig(data).options!.plugins!.legend!
    expect(legend.onClick).toBeTypeOf("function")
    expect(legend.onHover).toBeTypeOf("function")
    expect(legend.onLeave).toBeTypeOf("function")
    const noop = (handler: typeof legend.onClick) => (handler as unknown as () => void)()
    expect(noop(legend.onClick)).toBeUndefined()
    expect(noop(legend.onHover)).toBeUndefined()
    expect(noop(legend.onLeave)).toBeUndefined()
  })

  it("pads a capped axis beyond the cap so a clamped bubble is not cut", () => {
    const capped = bubbleChartData(
      [
        event({ id: "a", shifts: 2, registrations: 5 }),
        event({ id: "b", shifts: 3, registrations: 6 }),
        event({ id: "c", shifts: 4, registrations: 8 }),
        event({ id: "huge", shifts: 1000, registrations: 2000, roles: 20 }),
      ],
      at("2026-07-10T09:00:00Z"),
    )
    expect(capped.axis).toEqual({ xMax: 5, yMax: 10, capped: true })
    const config = buildBubbleChartConfig(capped)
    const x = config.options!.scales!.x as { suggestedMax?: number }
    const y = config.options!.scales!.y as { suggestedMax?: number }
    expect(x.suggestedMax).toBe(6)
    expect(y.suggestedMax).toBe(11)
    expect(config.data.datasets.flatMap((set) => set.data!).find((point) => point.id === "huge")).toMatchObject({ x: 5, y: 10, shifts: 1000, registrations: 2000 })
    // A chart without outliers leaves the scale automatic.
    expect((buildBubbleChartConfig(data).options!.scales!.x as { suggestedMax?: number }).suggestedMax).toBeUndefined()
  })

  it("never animates the entrance, whatever the motion preference", () => {
    expect(buildBubbleChartConfig(data).options!.animation).toBe(false)
  })

  it("describes the bubble in the tooltip with organisation, event, situation, values and dates", () => {
    const point = data.points[0]
    expect(bubbleTooltipTitle(point)).toBe("Fête — En cours")
    expect(bubbleTooltipLines(point)).toEqual(["En cours", "2 créneaux", "5 inscriptions", "1 poste", "10 juillet 2026"])
    const config = buildBubbleChartConfig(data)
    const callbacks = config.options!.plugins!.tooltip!.callbacks!
    expect(callbacks.title).toBeTypeOf("function")
    expect(callbacks.label).toBeTypeOf("function")
  })
})
