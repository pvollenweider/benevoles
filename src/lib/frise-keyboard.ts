// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Keyboard model of the public frise (#1075): one tab stop per day, arrows between its bars.
 * Left and Right stay in a poste's row (its bars in time order, lanes merged), Up and Down go to
 * the adjacent row, Home and End to the ends of the row, Ctrl+Home and Ctrl+End to the ends of
 * the day. No wrap. Pure: the component passes its rows in reading order, this answers an id.
 */

/** One bar, its minutes from the start of the day (end past midnight above 24h). */
export type FriseBar = { id: string; start: number; end: number }

/** The bars of each poste row, rows top to bottom, bars in reading order. */
export type FriseRows = FriseBar[][]

/** The keys the frise handles; anything else is left to the browser. */
export type FriseKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End"

const KEYS: readonly string[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"] satisfies FriseKey[]

/**
 * The key a keydown means for the frise, or null: Alt, Meta and Shift combinations, a key while
 * an input method composes, and Ctrl with an arrow are left alone; Ctrl only goes with Home / End.
 */
export function friseKey(e: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; isComposing?: boolean }): { key: FriseKey; ctrl: boolean } | null {
  if (e.isComposing || e.altKey || e.metaKey || e.shiftKey) return null
  if (!KEYS.includes(e.key)) return null
  const key = e.key as FriseKey
  if (e.ctrlKey && key !== "Home" && key !== "End") return null
  return { key, ctrl: e.ctrlKey }
}

/** Minutes two bars share. */
function overlap(a: FriseBar, b: FriseBar): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start))
}

/**
 * The bar of `row` that best matches `from`: the one sharing the most time with it, then the
 * closest start, then the earlier one (the first in reading order).
 */
function closest(row: FriseBar[], from: FriseBar): FriseBar {
  let best = row[0]
  for (const bar of row.slice(1)) {
    const o = overlap(bar, from), bo = overlap(best, from)
    if (o > bo) { best = bar; continue }
    if (o < bo) continue
    const d = Math.abs(bar.start - from.start), bd = Math.abs(best.start - from.start)
    if (d < bd || (d === bd && bar.start < best.start)) best = bar
  }
  return best
}

/** The id of the bar a key moves to from `currentId`, or null when it stays (an end, an unknown id). */
export function friseTarget(rows: FriseRows, currentId: string, key: FriseKey, ctrl = false): string | null {
  const filled = rows.filter((r) => r.length > 0)
  const r = filled.findIndex((row) => row.some((b) => b.id === currentId))
  if (r < 0) return null
  const row = filled[r]
  const i = row.findIndex((b) => b.id === currentId)
  let target: FriseBar | undefined
  switch (key) {
    case "ArrowLeft": target = row[i - 1]; break
    case "ArrowRight": target = row[i + 1]; break
    case "ArrowUp": target = r > 0 ? closest(filled[r - 1], row[i]) : undefined; break
    case "ArrowDown": target = r < filled.length - 1 ? closest(filled[r + 1], row[i]) : undefined; break
    case "Home": target = ctrl ? filled[0][0] : row[0]; break
    case "End": target = ctrl ? filled[filled.length - 1].at(-1) : row.at(-1); break
  }
  return target && target.id !== currentId ? target.id : null
}

/**
 * The bar that holds the day's tab stop: the last one focused or touched while it is still drawn,
 * else the first that can be chosen, else the first bar. Computed from props alone, so the server
 * and the client draw the same tab stop.
 */
export function friseTabStop(order: string[], clickable: ReadonlySet<string>, remembered: string | null): string | null {
  if (remembered && order.includes(remembered)) return remembered
  return order.find((id) => clickable.has(id)) ?? order[0] ?? null
}

/** The keys, read on entering a day's schedule (first in its region, and its description). */
export const FRISE_KEYS_SPOKEN = "Flèches gauche et droite : créneaux du même poste. Flèches haut et bas : poste voisin. Début et Fin : bouts de la ligne. Entrée ou Espace choisit un créneau disponible."

/** The same, shown under the chart while a bar has the keyboard focus (aria-hidden: read above). */
export const FRISE_KEYS_SHOWN = "← → : même poste · ↑ ↓ : poste voisin · Tab : quitter le planning"
