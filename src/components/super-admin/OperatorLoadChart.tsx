"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useMemo, useRef, useState } from "react"
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from "react"
import Link from "next/link"
import { eventDatesLabel } from "@/lib/operator-activity"
import {
  DEFAULT_LOAD_RANGE,
  LOAD_RANGES,
  LOAD_RANGE_KEYS,
  buildLoadRange,
  countLabel,
  detailHeadingFor,
  eventBand,
  eventDetail,
  formatAxisDay,
  formatLoadNumber,
  formatLongDay,
  formatShortDay,
  loadAxes,
  loadDescription,
  periodAriaLabel,
  periodEventRows,
  periodTitle,
  periodWord,
  rangeAnnouncement,
  type LoadBucket,
  type LoadRange,
  type OperatorLoadData,
} from "@/lib/operator-load"

/**
 * The « Charge par jour » chart (#1415): shifts per period as stacked bars, the number of distinct
 * events as a dashed line on its own axis, a range switch, and a detail panel for the selected
 * period or event. Client-only because the range, the roving focus and the selection live in the
 * browser; the data it receives is plain serialisable facts, so the Prisma loader stays on the
 * server.
 *
 * Accessibility: the SVG is purely visual (`aria-hidden`) and the periods are real HTML buttons
 * absolutely positioned over it, so a screen reader reaches them. The previous/next buttons beside
 * the detail heading are the ≥ 24 px equivalent control when the bars are narrower than that. The
 * five events with the most shifts in the displayed range keep a categorical colour, each chosen
 * to reach at least 3:1 against the white card; « Autres créneaux » is neutral grey. Colour never
 * carries the meaning alone: the legend names the events, the detail lists them, and every
 * period's aria-label gives the same figures as the tooltip.
 */

// Categorical colours, checked for colour-vision deficiency (ColorBrewer Dark2 hues, the fifth
// replaced by a dark blue so no two series are greens of similar luminance). « Autres » is a
// neutral grey above 3:1 as well.
const SERIES_COLORS = ["#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#1f5f8b"] as const
const OTHER_COLOR = "#8b93a1"
const ACCENT = "#2563eb"

const WIDTH = 900
const LEFT = 52
const RIGHT = 44
const TOP = 30
const PLOT_HEIGHT = 280
const HEIGHT = TOP + PLOT_HEIGHT + 30
const BAR_GAP = 3
const TOOLTIP_WIDTH = 320

const PERIOD_GROUP_LABEL = "Périodes : flèches gauche et droite pour se déplacer, Entrée pour afficher le détail"

type TooltipState = { index: number; x: number; y: number }

function seriesColor(colorIndex: number): string {
  return colorIndex >= 0 && colorIndex < SERIES_COLORS.length ? SERIES_COLORS[colorIndex] : OTHER_COLOR
}

const LINK_CLASS =
  "rounded text-blue-700 underline underline-offset-2 hover:text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

const BUTTON_CLASS =
  "rounded font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

const STEP_BUTTON_CLASS =
  "inline-flex min-h-6 min-w-6 items-center justify-center rounded border border-gray-500 bg-white px-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400"

// The transparent hit area over a bar: the white inner ring keeps the focus visible on dark
// series colours, the blue outline on the white card.
const PERIOD_BUTTON_CLASS =
  "pointer-events-auto absolute rounded-sm bg-transparent focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"

const REGION_CLASS =
  "overflow-x-auto rounded-xl border border-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

export default function OperatorLoadChart({ data }: { data: OperatorLoadData }) {
  const [rangeKey, setRangeKey] = useState(DEFAULT_LOAD_RANGE)
  const initialRange = useMemo(() => buildLoadRange(data, DEFAULT_LOAD_RANGE), [data])
  const range = useMemo(() => buildLoadRange(data, rangeKey), [data, rangeKey])
  const [selectedIndex, setSelectedIndex] = useState(initialRange.todayIndex)
  const [focusIndex, setFocusIndex] = useState(initialRange.todayIndex)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const barRefs = useRef<(HTMLButtonElement | null)[]>([])
  const eventHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const pendingBarFocus = useRef(false)
  const uid = useId()
  const detailTitleId = `${uid}-detail-title`
  const descriptionId = `${uid}-description`

  const selectedBucket = range.buckets[selectedIndex] ?? range.buckets[range.todayIndex]
  const selectedEvent = selectedEventId ? data.events.find((event) => event.id === selectedEventId) ?? null : null
  const band = selectedEvent ? eventBand(range, selectedEvent) : null
  const detail = selectedEvent ? eventDetail(range, data, selectedEvent.id) : null
  const periodRows = selectedEvent ? [] : periodEventRows(range, data, selectedIndex)
  const canPrevious = selectedIndex > 0
  const canNext = selectedIndex < range.buckets.length - 1

  // The event's heading takes the focus when an event is chosen, as the preview does.
  useEffect(() => {
    if (selectedEventId) eventHeadingRef.current?.focus()
  }, [selectedEventId])

  // « Revenir au … » restores the period and puts the focus back on its button.
  useEffect(() => {
    if (pendingBarFocus.current && selectedEventId === null) {
      pendingBarFocus.current = false
      barRefs.current[selectedIndex]?.focus()
    }
  }, [selectedEventId, selectedIndex])

  // Escape dismisses the supplementary tooltip, wherever the focus is.
  useEffect(() => {
    if (!tooltip) return
    function dismiss(event: KeyboardEvent) {
      if (event.key === "Escape") setTooltip(null)
    }
    document.addEventListener("keydown", dismiss)
    return () => document.removeEventListener("keydown", dismiss)
  }, [tooltip])

  function choosePeriod(index: number) {
    setSelectedIndex(index)
    setFocusIndex(index)
    setSelectedEventId(null)
    const bucket = range.buckets[index]
    if (bucket) setAnnouncement(detailHeadingFor(bucket, range.today, range.definition.unit))
  }

  function chooseRange(key: (typeof LOAD_RANGE_KEYS)[number]) {
    if (key === rangeKey) return
    const next = buildLoadRange(data, key)
    setRangeKey(key)
    setSelectedIndex(next.todayIndex)
    setFocusIndex(next.todayIndex)
    setSelectedEventId(null)
    setTooltip(null)
    setHoverIndex(null)
    setAnnouncement(rangeAnnouncement(next.definition))
  }

  function chooseEvent(eventId: string) {
    setSelectedEventId(eventId)
  }

  function backToPeriod() {
    pendingBarFocus.current = true
    setFocusIndex(selectedIndex)
    setSelectedEventId(null)
  }

  function moveFocus(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === "ArrowRight"
        ? index + 1
        : event.key === "ArrowLeft"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? range.buckets.length - 1
              : null
    if (next === null || next < 0 || next >= range.buckets.length) return
    event.preventDefault()
    setFocusIndex(next)
    barRefs.current[next]?.focus()
  }

  function onPeriodKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      choosePeriod(index)
      return
    }
    moveFocus(event, index)
  }

  function tooltipX(clientX: number): number {
    return Math.max(8, Math.min(clientX + 12, window.innerWidth - TOOLTIP_WIDTH - 8))
  }

  function showTooltipAt(index: number, clientX: number, clientY: number) {
    setTooltip({ index, x: tooltipX(clientX), y: Math.max(8, clientY - 12) })
  }

  function showTooltipFromPointer(event: ReactMouseEvent<HTMLButtonElement>, index: number) {
    setHoverIndex(index)
    showTooltipAt(index, event.clientX, event.clientY)
  }

  function showTooltipFromFocus(event: ReactFocusEvent<HTMLButtonElement>, index: number) {
    // Positioned from the button itself, so a keyboard user sees it near the bar they reached.
    const rect = event.currentTarget.getBoundingClientRect()
    setTooltip({ index, x: tooltipX(rect.left + rect.width / 2), y: Math.max(8, rect.top + 8) })
  }

  const { shifts: shiftAxis, events: eventAxis } = loadAxes(range.buckets)
  const plotWidth = WIDTH - LEFT - RIGHT
  const barWidth = plotWidth / range.buckets.length
  const barInset = Math.min(BAR_GAP, barWidth * 0.15)
  const barVisualWidth = Math.max(1, barWidth - 2 * barInset)
  const yShifts = (value: number) => TOP + PLOT_HEIGHT - (value / shiftAxis.max) * PLOT_HEIGHT
  const yEvents = (value: number) => TOP + PLOT_HEIGHT - (value / eventAxis.max) * PLOT_HEIGHT
  const barX = (index: number) => LEFT + index * barWidth
  const labelEvery = Math.ceil(range.buckets.length / 10)
  const points = range.buckets.map((bucket, index) => `${barX(index) + barWidth / 2},${yEvents(bucket.events)}`).join(" ")
  const todayX = LEFT + range.todayIndex * barWidth
  const bandLabel = selectedEvent && band
    ? `${band.startsBefore ? "← " : ""}${selectedEvent.title.length > 38 ? `${selectedEvent.title.slice(0, 37)}…` : selectedEvent.title}${band.endsAfter ? " →" : ""}`
    : ""

  const detailHeading = selectedBucket
    ? detailHeadingFor(selectedBucket, range.today, range.definition.unit)
    : ""
  const description = loadDescription(range.definition, range.start, range.end)

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Période affichée" className="inline-flex w-fit">
        {LOAD_RANGE_KEYS.map((key) => {
          const pressed = key === rangeKey
          return (
            <button
              key={key}
              type="button"
              aria-pressed={pressed}
              onClick={() => chooseRange(key)}
              className={`relative -ml-px min-h-9 border border-gray-500 px-3.5 text-sm first:ml-0 first:rounded-l-lg last:rounded-r-lg forced-colors:aria-pressed:bg-[Highlight] focus-visible:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                pressed ? "z-10 border-blue-700 bg-blue-700 font-semibold text-white" : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {LOAD_RANGES[key].buttonLabel}
            </button>
          )
        })}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
        {range.topEvents.map((event, index) => (
          <li key={event.id} className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: seriesColor(index) }} />
            <span className="break-words">{event.title}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: OTHER_COLOR }} />
          Autres créneaux
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true" className="shrink-0">
            <line x1="0" y1="5" x2="26" y2="5" stroke="#111827" strokeWidth="2" strokeDasharray="5 3" />
            <circle cx="13" cy="5" r="3" fill="#ffffff" stroke="#111827" strokeWidth="2" />
          </svg>
          Événements (axe de droite)
        </li>
      </ul>

      <p id={descriptionId} className="sr-only">
        {description}
      </p>

      <div className="overflow-x-auto">
        <div className="relative min-w-[640px]">
          <svg aria-hidden="true" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block h-auto w-full">
            {shiftAxis.ticks.map((tick) => (
              <g key={`s-${tick}`}>
                <line x1={LEFT} x2={WIDTH - RIGHT} y1={yShifts(tick)} y2={yShifts(tick)} className="stroke-gray-200" strokeWidth={1} />
                <text x={LEFT - 6} y={yShifts(tick) + 4} textAnchor="end" className="fill-gray-600 text-[13px]">
                  {formatLoadNumber(tick)}
                </text>
              </g>
            ))}
            {eventAxis.ticks.map((tick) => (
              <g key={`e-${tick}`}>
                <line x1={WIDTH - RIGHT} x2={WIDTH - RIGHT + 4} y1={yEvents(tick)} y2={yEvents(tick)} className="stroke-gray-300" strokeWidth={1} />
                <text x={WIDTH - RIGHT + 7} y={yEvents(tick) + 4} className="fill-gray-600 text-[13px]">
                  {formatLoadNumber(tick)}
                </text>
              </g>
            ))}
            <text x={4} y={TOP - 14} className="fill-gray-900 text-[13px] font-semibold">
              {range.definition.unit === "day" ? "Créneaux par jour" : "Créneaux par semaine"}
            </text>
            <text x={WIDTH - 4} y={TOP - 14} textAnchor="end" className="fill-gray-900 text-[13px] font-semibold">
              Événements
            </text>

            {band && (
              <g>
                <rect
                  x={barX(band.fromIndex)}
                  y={TOP}
                  width={barX(band.toIndex + 1) - barX(band.fromIndex)}
                  height={PLOT_HEIGHT}
                  rx={4}
                  fill={ACCENT}
                  opacity={0.12}
                />
                <rect
                  x={barX(band.fromIndex)}
                  y={TOP}
                  width={barX(band.toIndex + 1) - barX(band.fromIndex)}
                  height={PLOT_HEIGHT}
                  rx={4}
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              </g>
            )}

            {range.buckets.map((bucket, index) => {
              const selected = index === selectedIndex
              const x = barX(index) + barInset
              let accumulated = 0
              const segments = range.topEvents
                .map((event, colorIndex) => ({ value: bucket.byEvent[event.id]?.shifts ?? 0, color: seriesColor(colorIndex) }))
                .concat({
                  value: bucket.shifts - range.topEvents.reduce((sum, event) => sum + (bucket.byEvent[event.id]?.shifts ?? 0), 0),
                  color: OTHER_COLOR,
                })
              return (
                <g key={bucket.from}>
                  <rect
                    x={barX(index)}
                    y={TOP}
                    width={barWidth}
                    height={PLOT_HEIGHT}
                    className={`fill-gray-900 ${selected ? "opacity-[0.14]" : hoverIndex === index ? "opacity-[0.07]" : "opacity-0"}`}
                  />
                  <rect
                    x={barX(index) + 1}
                    y={TOP + 1}
                    width={Math.max(1, barWidth - 2)}
                    height={PLOT_HEIGHT - 2}
                    rx={3}
                    className="fill-none stroke-transparent"
                    strokeWidth={2}
                  />
                  {segments.map((segment, segmentIndex) => {
                    if (segment.value <= 0) return null
                    const y0 = yShifts(accumulated)
                    const y1 = yShifts(accumulated + segment.value)
                    accumulated += segment.value
                    return (
                      <rect
                        key={`${bucket.from}-${segmentIndex}`}
                        x={x}
                        y={y1}
                        width={barVisualWidth}
                        height={Math.max(0, y0 - y1 - (barWidth > 6 ? 1 : 0))}
                        rx={barWidth > 8 ? 1 : 0}
                        fill={segment.color}
                      />
                    )
                  })}
                  {/* The selected period keeps a dark marker under the x axis, in addition to the grey wash. */}
                  {selected && <rect x={barX(index)} y={TOP + PLOT_HEIGHT + 2} width={barWidth} height={4} rx={1} className="fill-gray-900" />}
                </g>
              )
            })}

            <rect x={LEFT} y={TOP} width={Math.max(0, todayX - LEFT)} height={PLOT_HEIGHT} fill="#111827" opacity={0.04} pointerEvents="none" />
            <line x1={todayX} x2={todayX} y1={TOP - 4} y2={TOP + PLOT_HEIGHT} className="stroke-gray-900" strokeWidth={1.5} pointerEvents="none" />
            <text x={todayX + 4} y={TOP - 2} className="fill-gray-900 text-[13px] font-semibold" pointerEvents="none">
              aujourd&apos;hui →
            </text>
            <text x={todayX - 4} y={TOP - 2} textAnchor="end" className="fill-gray-600 text-[13px]" pointerEvents="none">
              ← passé
            </text>

            <line x1={LEFT} x2={WIDTH - RIGHT} y1={yShifts(0)} y2={yShifts(0)} className="stroke-gray-300" strokeWidth={1} />
            <polyline
              points={points}
              fill="none"
              stroke="#111827"
              strokeWidth={2}
              strokeDasharray="5 3"
              strokeLinejoin="round"
              pointerEvents="none"
            />
            {range.buckets.length <= 60 &&
              range.buckets.map((bucket, index) => (
                <circle
                  key={`point-${bucket.from}`}
                  cx={barX(index) + barWidth / 2}
                  cy={yEvents(bucket.events)}
                  r={range.buckets.length > 31 ? 2.5 : 3.5}
                  fill="#ffffff"
                  stroke="#111827"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              ))}

            {bandLabel && (
              <text
                x={Math.min(barX(band!.fromIndex) + 6, WIDTH - RIGHT - 220)}
                y={TOP + 14}
                className="fill-gray-900 text-[13px] font-semibold"
                stroke="#fff"
                strokeWidth={3}
                paintOrder="stroke"
                pointerEvents="none"
              >
                {bandLabel}
              </text>
            )}

            {range.buckets.map((bucket, index) =>
              index % labelEvery === 0 ? (
                <text key={`label-${bucket.from}`} x={barX(index) + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" className="fill-gray-600 text-[13px]">
                  {formatAxisDay(bucket.from, range.definition.days)}
                </text>
              ) : null,
            )}
          </svg>

          <div role="group" aria-label={PERIOD_GROUP_LABEL} aria-describedby={descriptionId} className="pointer-events-none absolute inset-0">
            {range.buckets.map((bucket, index) => (
              <button
                key={bucket.from}
                ref={(node) => {
                  barRefs.current[index] = node
                }}
                type="button"
                tabIndex={index === focusIndex ? 0 : -1}
                aria-pressed={index === selectedIndex}
                aria-label={periodAriaLabel(bucket, range.today, range.definition.unit)}
                onClick={() => choosePeriod(index)}
                onKeyDown={(event) => onPeriodKeyDown(event, index)}
                onMouseMove={(event) => showTooltipFromPointer(event, index)}
                onMouseLeave={() => {
                  setHoverIndex(null)
                  setTooltip(null)
                }}
                onFocus={(event) => showTooltipFromFocus(event, index)}
                onBlur={() => setTooltip(null)}
                className={PERIOD_BUTTON_CLASS}
                style={{
                  left: `${(barX(index) / WIDTH) * 100}%`,
                  top: `${(TOP / HEIGHT) * 100}%`,
                  width: `${(barWidth / WIDTH) * 100}%`,
                  height: `${(PLOT_HEIGHT / HEIGHT) * 100}%`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-600">Au clavier : flèches pour changer de période, Entrée pour le détail.</p>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {tooltip && range.buckets[tooltip.index] && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-20 max-w-xs rounded-md bg-gray-900 px-2.5 py-1.5 text-xs leading-snug text-white"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="font-semibold">{periodTitle(range.buckets[tooltip.index], range.definition.unit)}</p>
          <p>
            {countLabel(range.buckets[tooltip.index].shifts, "créneau", "créneaux")} · {countLabel(range.buckets[tooltip.index].events, "événement", "événements")} ·{" "}
            {countLabel(range.buckets[tooltip.index].registrations, "inscrit", "inscrits")}
          </p>
          <p className="opacity-80">Cliquer pour le détail</p>
        </div>
      )}

      <div className="grid min-w-0 gap-2 border-t border-gray-200 pt-3">
        {selectedEvent && detail ? (
          <EventDetail
            detail={detail}
            range={range}
            bucket={selectedBucket}
            titleId={detailTitleId}
            headingRef={eventHeadingRef}
            onBack={backToPeriod}
            onPrevious={() => choosePeriod(selectedIndex - 1)}
            onNext={() => choosePeriod(selectedIndex + 1)}
            canPrevious={canPrevious}
            canNext={canNext}
          />
        ) : (
          <PeriodDetail
            range={range}
            rows={periodRows}
            titleId={detailTitleId}
            heading={detailHeading}
            onChooseEvent={chooseEvent}
            onPrevious={() => choosePeriod(selectedIndex - 1)}
            onNext={() => choosePeriod(selectedIndex + 1)}
            canPrevious={canPrevious}
            canNext={canNext}
          />
        )}
      </div>
    </div>
  )
}

function DetailHeading({
  titleId,
  headingRef,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
  children,
}: {
  titleId: string
  headingRef?: RefObject<HTMLHeadingElement | null>
  onPrevious: () => void
  onNext: () => void
  canPrevious: boolean
  canNext: boolean
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-2">
      <h4
        id={titleId}
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
        className={`min-w-0 text-base font-semibold text-gray-900 ${headingRef ? "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" : ""}`}
      >
        {children}
      </h4>
      <div role="group" aria-label="Changer de période" className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!canPrevious}
          aria-label="Période précédente"
          className={STEP_BUTTON_CLASS}
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Période suivante"
          className={STEP_BUTTON_CLASS}
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  )
}

function PeriodDetail({
  range,
  rows,
  titleId,
  heading,
  onChooseEvent,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
}: {
  range: LoadRange
  rows: ReturnType<typeof periodEventRows>
  titleId: string
  heading: string
  onChooseEvent: (eventId: string) => void
  onPrevious: () => void
  onNext: () => void
  canPrevious: boolean
  canNext: boolean
}) {
  const unit = range.definition.unit
  const per = periodWord(unit)
  return (
    <>
      <DetailHeading titleId={titleId} onPrevious={onPrevious} onNext={onNext} canPrevious={canPrevious} canNext={canNext}>
        {heading}
      </DetailHeading>
      <div role="region" aria-labelledby={titleId} tabIndex={0} className={REGION_CLASS}>
        <table className="w-full text-sm">
          <caption className="px-4 pb-1 pt-3 text-left text-sm text-gray-600">
            {`Événements avec au moins un créneau ${unit === "day" ? "ce jour-là" : "cette semaine"}, du plus chargé au moins chargé. Choisissez un événement pour voir toute sa durée sur le graphique.`}
          </caption>
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Événement</th>
              <th scope="col" className="px-4 py-2 font-medium">Organisation</th>
              <th scope="col" className="px-4 py-2 font-medium">Dates</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">{`Créneaux ${per}`}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">{`Inscrits ${per}`}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-2 text-gray-700">Aucun créneau sur cette période.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.event.id}>
                  <th scope="row" className="px-4 py-2 text-left align-top font-semibold text-gray-900">
                    {row.colorIndex >= 0 && (
                      <span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ backgroundColor: seriesColor(row.colorIndex) }} />
                    )}
                    <button type="button" onClick={() => onChooseEvent(row.event.id)} className={`text-left ${BUTTON_CLASS}`}>
                      {row.event.title}
                    </button>
                  </th>
                  <td className="px-4 py-2 align-top text-gray-700">
                    <Link href={`/super-admin/organizations/${row.event.organizationSlug}`} className={LINK_CLASS}>
                      {row.event.organizationName}
                      <span className="sr-only"> (fiche de l&apos;organisation)</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2 align-top text-gray-700">
                    {eventDatesLabel(row.event.startDate, row.event.endDate)}
                    {row.event.archived && <span className="text-gray-600"> (archivé)</span>}
                  </td>
                  <td className="px-4 py-2 text-right align-top tabular-nums text-gray-900">{formatLoadNumber(row.shifts)}</td>
                  <td className="px-4 py-2 text-right align-top tabular-nums text-gray-900">{formatLoadNumber(row.registrations)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function EventDetail({
  detail,
  range,
  bucket,
  titleId,
  headingRef,
  onBack,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
}: {
  detail: NonNullable<ReturnType<typeof eventDetail>>
  range: LoadRange
  bucket: LoadBucket | undefined
  titleId: string
  headingRef: RefObject<HTMLHeadingElement | null>
  onBack: () => void
  onPrevious: () => void
  onNext: () => void
  canPrevious: boolean
  canNext: boolean
}) {
  const event = detail.event
  const places = `${formatLoadNumber(event.registrations)} inscrits sur ${formatLoadNumber(event.capacity)} places`
  const fill = detail.fillPercent === null ? "" : ` (${detail.fillPercent} %)`
  return (
    <>
      <DetailHeading
        titleId={titleId}
        headingRef={headingRef}
        onPrevious={onPrevious}
        onNext={onNext}
        canPrevious={canPrevious}
        canNext={canNext}
      >
        {event.title}
      </DetailHeading>
      <p className="text-sm text-gray-700">
        {event.organizationName} · {eventDatesLabel(event.startDate, event.endDate)}
        {event.archived && " (archivé)"} · sur tout l&apos;événement : {formatLoadNumber(event.shifts)} créneaux, {places}
        {fill}
      </p>
      <div role="region" aria-labelledby={titleId} tabIndex={0} className={REGION_CLASS}>
        <table className="w-full text-sm">
          <caption className="px-4 pb-1 pt-3 text-left text-sm text-gray-600">
            {`Ses jours sur la période affichée (${range.definition.label.toLowerCase()}) : ${formatLoadNumber(detail.shifts)} créneaux, ${formatLoadNumber(detail.registrations)} inscrits`}
          </caption>
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Jour</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Créneaux</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Places</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Inscrits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {detail.days.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-2 text-gray-700">Aucun créneau sur la période affichée.</td>
              </tr>
            ) : (
              detail.days.map((day) => (
                <tr key={day.day}>
                  <th scope="row" className="px-4 py-2 text-left font-normal text-gray-900">{formatLongDay(day.day)}</th>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">{formatLoadNumber(day.shifts)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">{formatLoadNumber(day.capacity)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">{formatLoadNumber(day.registrations)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p>
        <button type="button" onClick={onBack} className={BUTTON_CLASS}>
          Revenir{" "}
          {range.definition.unit === "day"
            ? `au ${formatLongDay(bucket?.from ?? range.today)}`
            : `à la semaine du ${formatShortDay(bucket?.from ?? range.today)}`}
        </button>
      </p>
    </>
  )
}
