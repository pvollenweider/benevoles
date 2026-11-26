// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  CARD_BORDER,
  CARD_PADDING,
  LABEL_W,
  MAX_FRISE_FROM_WIDTH,
  MAX_PX_PER_MIN,
  MIN_FRISE_WIDTH,
  MIN_PX_PER_MIN,
  PAGE_GUTTER,
  READABLE_BAR_W,
  READABLE_OVERNIGHT_BAR_W,
  chartMinWidth,
  daySpan,
  friseDayReadableWidth,
  friseFromWidth,
  friseReadableWidth,
  narrowestBarWidth,
  type FriseDay,
} from "../frise-geometry"
import { crossesMidnight, toMin, toMinEnd } from "../gantt-utils"

const s = (startTime: string, endTime: string) => ({ startTime, endTime })
const day = (shifts: { startTime: string; endTime: string }[], shows: { startTime: string; endTime: string }[] = []): FriseDay => ({ shifts, shows })

/** What the layout spends before the plot: page gutters, card border, card padding, label column. */
const CHART_LEFT = PAGE_GUTTER + CARD_BORDER + CARD_PADDING + LABEL_W

/** A shift's duration on the day's axis: the layout number the bar's width is a share of. */
const duration = (shift: { startTime: string; endTime: string }) =>
  toMinEnd(shift.endTime, shift.startTime) - toMin(shift.startTime)

/**
 * The real layout: the card's inner width, the plot it leaves (fluid between the scroll floor and
 * the stretch ceiling), and each bar's width as its share of the day. Deliberately written from
 * the layout's literals, not from `friseDayReadableWidth`.
 */
function layout(d: FriseDay, viewport: number) {
  const axis = daySpan(d)!
  const inner = viewport - 32 - 2 // page px-4 both sides, then the card's 1 px border both sides
  const available = inner - 24 - 92 // the card's p-3, then the label column
  const plot = Math.min(Math.max(available, axis.span * MIN_PX_PER_MIN), axis.span * MAX_PX_PER_MIN)
  return {
    axis,
    plot,
    available,
    minWidth: chartMinWidth(axis.span),
    inner,
    bars: d.shifts.map((shift) => ({ ...shift, width: (plot * duration(shift)) / axis.span })),
  }
}

const readableBarOf = (shift: { startTime: string; endTime: string }) =>
  crossesMidnight(shift.startTime, shift.endTime) ? READABLE_OVERNIGHT_BAR_W : READABLE_BAR_W

describe("a day's span, as the chart computes it", () => {
  it("rounds out to full hours around the shifts", () => {
    // 09:30 is 570 min: down to 09:00; 11:15 is 675: up to 12:00.
    expect(daySpan(day([s("09:30", "11:15")]))).toEqual({ dayStart: 9 * 60, dayEnd: 12 * 60, span: 180 })
  })

  it("counts an overnight end past midnight", () => {
    expect(daySpan(day([s("22:00", "01:00")]))).toEqual({ dayStart: 22 * 60, dayEnd: 25 * 60, span: 180 })
  })

  it("includes the show bands, exactly as the chart draws them", () => {
    const shiftsOnly = daySpan(day([s("10:00", "11:00")]))
    const withShow = daySpan(day([s("10:00", "11:00")], [s("09:00", "12:00")]))
    expect(shiftsOnly).toEqual({ dayStart: 10 * 60, dayEnd: 11 * 60, span: 60 })
    expect(withShow).toEqual({ dayStart: 9 * 60, dayEnd: 12 * 60, span: 180 })
  })

  it("is null without anything to draw", () => {
    expect(daySpan(day([]))).toBeNull()
  })

  it("shares the chart's min-width (page padding is added by the caller)", () => {
    expect(chartMinWidth(60)).toBe(CARD_PADDING + LABEL_W + 60 * MIN_PX_PER_MIN)
  })
})

describe("the width from which the timeline stays readable", () => {
  it("is null for an event with no shift, shows alone included", () => {
    expect(friseReadableWidth([])).toBeNull()
    expect(friseReadableWidth([day([])])).toBeNull()
    expect(friseReadableWidth([day([], [s("20:00", "22:00")])])).toBeNull()
    expect(friseDayReadableWidth(day([]))).toBeNull()
  })

  it("never goes below 320 px", () => {
    // A single one-hour shift needs less than 320 px: the floor applies.
    expect(friseReadableWidth([day([s("10:00", "11:00")])])).toBe(MIN_FRISE_WIDTH)
    expect(friseReadableWidth([day([s("10:00", "11:00")])])).toBe(320)
  })

  it("asks exactly for the width where the narrowest bar reaches 64 px, and no less", () => {
    // 10–11 (60 min) and 13–14 (60 min): span 10:00–14:00 = 240 min.
    // 32 + 2 + 24 + 92 + ceil(64 × 240 / 60) = 150 + 256 = 406 px.
    const d = day([s("10:00", "11:00"), s("13:00", "14:00")])
    const width = friseReadableWidth([d])!
    expect(width).toBe(406)
    // At that width the narrowest bar is exactly 64 px; one pixel less is under.
    expect(narrowestBarWidth(d, width)).toBe(READABLE_BAR_W)
    expect(narrowestBarWidth(d, width - 1)).toBeLessThan(READABLE_BAR_W)
    expect(narrowestBarWidth(d, width - 1)).toBeCloseTo(63.75)
  })

  it("asks for the chart's own scroll width when it exceeds the bar's need", () => {
    // One 10:00–15:00 shift: span 300 min, so the chart needs 32 + 2 + 24 + 92 + 300 × 0.6
    // = 150 + 180 = 330 px to avoid scrolling, while its only bar would be readable from
    // 150 + 64 = 214 px.
    const d = day([s("10:00", "15:00")])
    expect(friseReadableWidth([d])).toBe(330)
  })

  it("counts a show band that widens the span", () => {
    // Without the band the floor (320) would win; with it the bar constraint decides:
    // span 09:00–12:00 = 180 min, shift 60 min: 32 + 2 + 24 + 92 + ceil(64 × 180 / 60)
    // = 150 + 192 = 342 px.
    expect(friseReadableWidth([day([s("10:00", "11:00")])])).toBe(320)
    expect(friseReadableWidth([day([s("10:00", "11:00")], [s("09:00", "12:00")])])).toBe(342)
  })

  it("asks 92 px across midnight from a bar that crosses it", () => {
    // The short 06–08 shift binds at 64 px; the 22:00–00:30 shift needs its long text (92 px)
    // and is the one that decides here. Span 06:00 (360) to the full hour after 00:30 (1500)
    // = 1140 min: 32 + 2 + 24 + 92 + ceil(92 × 1140 / 150) = 150 + 700 = 850 px.
    const d = day([s("06:00", "08:00"), s("22:00", "00:30")])
    const span = 1140
    const shortNeed = CHART_LEFT + Math.ceil((READABLE_BAR_W * span) / 120)
    const overnightNeed = CHART_LEFT + Math.ceil((READABLE_OVERNIGHT_BAR_W * span) / 150)
    expect(overnightNeed).toBe(850)
    expect(overnightNeed).toBeGreaterThan(shortNeed)
    expect(friseReadableWidth([d])).toBe(overnightNeed)
    // Without the 92 px rule the night bar would need the 64 px one: that must not be the answer.
    expect(friseReadableWidth([d])).not.toBe(shortNeed)
  })

  it("lets the day that needs the most decide, across all days", () => {
    const small = day([s("10:00", "11:00")])
    const large = day([s("10:00", "11:00"), s("13:00", "14:00")])
    expect(friseReadableWidth([small, large])).toBe(406)
    expect(friseReadableWidth([large, small])).toBe(406)
    // A day without shifts does not decide anything.
    expect(friseReadableWidth([day([]), small])).toBe(320)
  })

  it("rounds up: the smallest whole viewport where both rules hold", () => {
    // 10:00–10:45 (45 min) and 10:45–15:00 (255 min): span 10:00–15:00 = 300 min.
    // The 45 min bar needs 32 + 2 + 24 + 92 + 64 × 300 / 45 = 150 + 426.67, so 577 px.
    const width = friseReadableWidth([day([s("10:00", "10:45"), s("10:45", "15:00")])])
    expect(Number.isInteger(width)).toBe(true)
    expect(width).toBe(577)
  })

  it("is unreadable at any width when a shift is too short to reach its readable bar", () => {
    // A bar is at most duration × MAX_PX_PER_MIN: 30 min × 2 = 60 px, under the 64 px a day bar
    // needs. No viewport can make this day readable.
    const halfHours = day([s("10:00", "10:30"), s("10:30", "11:00")])
    expect(friseDayReadableWidth(halfHours)).toBe(Infinity)
    expect(friseReadableWidth([halfHours])).toBe(Infinity)
    // Overnight: 40 min × 2 = 80 px, under the 92 px its long range needs.
    expect(friseDayReadableWidth(day([s("23:30", "00:10")]))).toBe(Infinity)
    // Exactly 32 min (46 overnight) still makes it, at full stretch; the 320 px floor applies.
    expect(friseReadableWidth([day([s("10:00", "10:32")])])).toBe(320)
    expect(friseDayReadableWidth(day([s("23:30", "00:16")]))).not.toBe(Infinity)
  })

  it("walks the real layout numbers: the plot, the bars and the chart's min-width", () => {
    const cases = [
      // 406 px, the narrowest bar deciding.
      day([s("10:00", "11:00"), s("13:00", "14:00")]),
      // 330 px, the chart's scroll floor deciding.
      day([s("10:00", "15:00")]),
      // 342 px, a show band widening the span.
      day([s("10:00", "11:00")], [s("09:00", "12:00")]),
      // 850 px, an overnight bar needing 92 px.
      day([s("06:00", "08:00"), s("22:00", "00:30")]),
    ]
    const fails = (d: FriseDay, viewport: number) => {
      const l = layout(d, viewport)
      return l.minWidth > l.inner || l.bars.some((b) => b.width < readableBarOf(b))
    }
    for (const d of cases) {
      const width = friseReadableWidth([d])!
      const l = layout(d, width)
      // The plot really gets width − 32 (page) − 2 (card border) − 24 (card padding) − 92 (labels).
      expect(l.plot).toBe(width - 32 - 2 - 24 - 92)
      // Every bar prints its end time and state.
      for (const bar of l.bars) expect(bar.width).toBeGreaterThanOrEqual(readableBarOf(bar))
      // The chart's min-width fits inside the card, which therefore does not scroll.
      expect(l.minWidth).toBeLessThanOrEqual(width - 32 - 2)
      // One pixel less and one of the two fails: the rule is the smallest width.
      expect(fails(d, width)).toBe(false)
      expect(fails(d, width - 1)).toBe(true)
    }
  })
})

describe("the width from which the timeline is the default", () => {
  it("0 for « Frise »: always, even on a long event", () => {
    expect(friseFromWidth({ setting: "frise", long: false, readableWidth: 404 })).toBe(0)
    expect(friseFromWidth({ setting: "frise", long: true, readableWidth: 900 })).toBe(0)
  })

  it("null for « Liste »: never", () => {
    expect(friseFromWidth({ setting: "liste", long: false, readableWidth: 404 })).toBeNull()
    expect(friseFromWidth({ setting: "liste", long: true, readableWidth: 404 })).toBeNull()
  })

  it("null for automatic on a long event: the list on every width", () => {
    expect(friseFromWidth({ setting: "auto", long: true, readableWidth: 404 })).toBeNull()
    expect(friseFromWidth({ setting: "auto", long: true, readableWidth: null })).toBeNull()
  })

  it("the readable width for automatic, capped at 640 px", () => {
    expect(friseFromWidth({ setting: "auto", long: false, readableWidth: 404 })).toBe(404)
    expect(friseFromWidth({ setting: "auto", long: false, readableWidth: 320 })).toBe(320)
    expect(friseFromWidth({ setting: "auto", long: false, readableWidth: 639 })).toBe(639)
    expect(friseFromWidth({ setting: "auto", long: false, readableWidth: 640 })).toBe(640)
    expect(friseFromWidth({ setting: "auto", long: false, readableWidth: 641 })).toBe(MAX_FRISE_FROM_WIDTH)
    expect(friseFromWidth({ setting: "auto", long: false, readableWidth: 900 })).toBe(640)
    // A day that is never readable (a shift under 32 min) can wait for any width: the cap applies.
    expect(friseFromWidth({ setting: "auto", long: false, readableWidth: Infinity })).toBe(MAX_FRISE_FROM_WIDTH)
  })

  it("falls back to 640 px when the event has no shift", () => {
    expect(friseFromWidth({ setting: "auto", long: false, readableWidth: null })).toBe(640)
  })
})
