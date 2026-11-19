// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Chart.js configuration of the operator bubble chart (#1415), built from the framework-free
 * BubbleChartData of src/lib/operator-activity.ts. Pure: no canvas, no DOM, no chart.js runtime
 * import (types only), so it is tested without a browser. The client component registers the
 * controllers and renders it; the table beside it stays the accessible source of truth.
 *
 * Colours are the project's tokens (DESIGN.md): action-blue-deep for « en cours », the waiting
 * status brown for « dans les 7 jours », ink-muted for « dans 8 à 30 jours ». Each is also a
 * distinct pointStyle (circle / triangle / rect), so the category is never told by colour alone;
 * the solid border keeps at least 3:1 against white even where the translucent fill is lighter.
 */

import type { ChartConfiguration, ChartDataset, PointStyle, TooltipItem } from "chart.js"
import {
  BUBBLE_CATEGORY_LABELS,
  bubbleDateTickLabel,
  eventDatesLabel,
  type BubbleCategory,
  type BubbleChartData,
  type BubblePoint,
} from "./operator-activity"

export type BubblePointData = BubblePoint & { x: number; y: number; r: number }
export type BubbleDataset = ChartDataset<"bubble", BubblePointData[]>

export type BubbleCategoryStyle = {
  label: string
  color: string
  pointStyle: PointStyle
}

export const BUBBLE_CATEGORY_STYLES: Record<BubbleCategory, BubbleCategoryStyle> = {
  now: { label: BUBBLE_CATEGORY_LABELS.now, color: "#1d4ed8", pointStyle: "circle" },
  within7: { label: BUBBLE_CATEGORY_LABELS.within7, color: "#92400e", pointStyle: "triangle" },
  within30: { label: BUBBLE_CATEGORY_LABELS.within30, color: "#4b5563", pointStyle: "rect" },
}

const CATEGORY_ORDER: BubbleCategory[] = ["now", "within7", "within30"]

function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

/** Tooltip title: organisation then event, the two things that identify a bubble. */
export function bubbleTooltipTitle(point: BubblePoint): string {
  return `${point.organizationName} — ${point.title}`
}

/** Tooltip lines: the real values (not the capped chart coordinates), the situation and the dates. */
export function bubbleTooltipLines(point: BubblePoint): string[] {
  const places = `${point.roles} poste${point.roles > 1 ? "s" : ""}`
  const shifts = `${point.shifts} créneau${point.shifts > 1 ? "x" : ""}`
  const registrations = `${point.registrations} inscription${point.registrations > 1 ? "s" : ""}`
  return [BUBBLE_CATEGORY_LABELS[point.category], shifts, registrations, places, eventDatesLabel(point.startDate, point.endDate)]
}

function dataset(category: BubbleCategory, points: BubblePointData[]): BubbleDataset {
  const style = BUBBLE_CATEGORY_STYLES[category]
  return {
    label: style.label,
    data: points,
    backgroundColor: withAlpha(style.color, 0.72),
    borderColor: style.color,
    // A capped point sits on the axis limit: a thicker border says it is beyond the scale, in
    // addition to the summary and the real values in the table.
    borderWidth: (context) => {
      const point = context.raw as BubblePointData
      return point.clampedY ? 3 : 1.5
    },
    // Hover thickens the border a little, never to the width that marks a capped point.
    hoverBorderWidth: (context) => {
      const point = context.raw as BubblePointData
      return point.clampedY ? 4 : 2.5
    },
    pointStyle: style.pointStyle,
  }
}

/** The chart x/y values are the real ones except on a capped axis, where they are clamped. */
function pointData(point: BubblePoint): BubblePointData {
  return { ...point, x: point.x, y: point.y, r: point.radius }
}

/** The axis title states the cap when the chart caps that axis. */
export function bubbleAxisTitle(base: string, cap: number | null): string {
  return cap === null ? base : `${base} (plafonné à ${cap})`
}

/** Tick steps that stay readable: one label every few days, never more than about six. */
const TICK_STEPS = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 365] as const

/**
 * Tick offsets (days from today) for the date axis: always includes 0 so « Aujourd'hui » can be
 * shown, and widens its step with the range so a long-running event cannot crowd the labels.
 */
export function bubbleDateTicks(min: number, max: number): number[] {
  const span = max - min
  if (!(span > 0)) return [0]
  const step = TICK_STEPS.find((candidate) => span / candidate <= 6) ?? TICK_STEPS[TICK_STEPS.length - 1]
  const first = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let value = first; value <= max; value += step) ticks.push(value === 0 ? 0 : value)
  return ticks
}

/**
 * The Chart.js configuration. Animation is always off: DESIGN.md forbids orchestrated entrances
 * on dashboards, and a chart that grows on load is exactly that (no reduced-motion exception).
 * The legend is display-only (no click/hover handler), so a dataset can never be hidden by mouse.
 * The date axis is fixed from the earliest start day to today + 30 days, with a small margin, and
 * is never capped. A capped registrations axis gets a small padding beyond the cap so a clamped
 * bubble is not cut in half.
 */
export function buildBubbleChartConfig(data: BubbleChartData): ChartConfiguration<"bubble", BubblePointData[]> {
  const datasets = CATEGORY_ORDER.map((category) =>
    dataset(category, data.points.filter((point) => point.category === category).map(pointData)),
  )

  return {
    type: "bubble",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          position: "bottom",
          onClick: () => {},
          onHover: () => {},
          onLeave: () => {},
          labels: { usePointStyle: true, boxWidth: 10, boxHeight: 10, padding: 16, color: "#1f2937" },
        },
        tooltip: {
          callbacks: {
            title: (items: TooltipItem<"bubble">[]) => {
              const point = items[0]?.raw as BubblePoint | undefined
              return point ? bubbleTooltipTitle(point) : ""
            },
            label: (item: TooltipItem<"bubble">) => {
              const point = item.raw as BubblePoint | undefined
              return point ? bubbleTooltipLines(point) : ""
            },
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          min: data.axis.xMin,
          max: data.axis.xMax,
          afterBuildTicks: (axis) => {
            axis.ticks = bubbleDateTicks(data.axis.xMin, data.axis.xMax).map((value) => ({ value }))
          },
          title: { display: true, text: "Date de début", color: "#1f2937" },
          ticks: {
            precision: 0,
            color: "#4b5563",
            maxRotation: 0,
            // bubbleDateTicks gives at most about six ticks: no auto-skip, so « Aujourd'hui » (0) is
            // never dropped at narrow width when the axis starts before today.
            autoSkip: false,
            callback: (value) => bubbleDateTickLabel(Number(value), data.today),
          },
          grid: { color: "#e5e7eb" },
        },
        y: {
          type: "linear",
          beginAtZero: true,
          grace: "6%",
          ...(data.axis.yMax !== null ? { suggestedMax: Math.ceil(data.axis.yMax * 1.08) } : {}),
          title: { display: true, text: bubbleAxisTitle("Nombre d'inscriptions", data.axis.yMax), color: "#1f2937" },
          ticks: { precision: 0, color: "#4b5563" },
          grid: { color: "#e5e7eb" },
        },
      },
    },
  }
}
