"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react"
import type { Chart } from "chart.js"
import { buildBubbleChartConfig } from "@/lib/operator-bubble-chart-config"
import type { BubbleChartData } from "@/lib/operator-activity"

/**
 * The operator bubble chart (#1415), the only page loading Chart.js. The library is imported
 * dynamically inside the effect, so its chunk never weighs on any other page; only the controllers,
 * point element, linear scale, tooltip and legend are registered (never `chart.js/auto`).
 *
 * The canvas is not accessible by itself: it carries role="img" and is named by a hidden sentence
 * describing the encoding (aria-labelledby); the visible summary that follows it is read once, as
 * ordinary text. The summary and the « Par situation » table below it are the accessible
 * alternative. When the chunk cannot be loaded, they remain and a sentence replaces the canvas.
 * The chart is destroyed on unmount and resized by Chart.js with its container.
 */

let chartJs: Promise<typeof import("chart.js")> | null = null

function loadChartJs(): Promise<typeof import("chart.js")> {
  chartJs ??= import("chart.js")
  return chartJs
}

export default function OperatorBubbleChart({ data, labelId }: { data: BubbleChartData; labelId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (data.empty) return
    let disposed = false
    let chart: Chart<"bubble"> | null = null

    void (async () => {
      try {
        const { Chart, BubbleController, PointElement, LinearScale, Tooltip, Legend } = await loadChartJs()
        if (disposed || !canvasRef.current) return
        Chart.register(BubbleController, PointElement, LinearScale, Tooltip, Legend)
        chart = new Chart(canvasRef.current, buildBubbleChartConfig(data)) as Chart<"bubble">
      } catch {
        if (!disposed) setFailed(true)
      }
    })()

    return () => {
      disposed = true
      chart?.destroy()
      chart = null
    }
  }, [data])

  if (data.empty) return null
  if (failed) return <p className="text-sm text-gray-700">Le graphique n&apos;a pas pu être chargé ; le résumé et le tableau « Par situation » restent affichés.</p>

  return (
    <div className="relative h-64 w-full sm:h-80">
      <canvas ref={canvasRef} role="img" aria-labelledby={labelId} />
    </div>
  )
}
