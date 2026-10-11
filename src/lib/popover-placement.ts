// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

export type PopoverPlacement = { top: number; maxHeight: number; side: "below" | "above" | "inside" }

/**
 * Vertical placement of a popover opened from a bar (the timeline quick editor): below the bar
 * when its content fits there, or when there is at least as much room below as above; otherwise
 * above it; and when neither side has `minHeight`, clamped inside the viewport (it then covers
 * the bar). The popover never leaves the viewport: `maxHeight` is the room it has, the rest
 * scrolls inside it. `contentHeight` is unknown before the first measure: the room available
 * is then taken as is.
 */
export function popoverPlacement({
  anchorTop, anchorBottom, viewportHeight, contentHeight, gap = 6, margin = 8, minHeight = 160,
}: {
  anchorTop: number
  anchorBottom: number
  viewportHeight: number
  contentHeight?: number
  gap?: number
  margin?: number
  minHeight?: number
}): PopoverPlacement {
  const below = viewportHeight - anchorBottom - gap - margin
  const above = anchorTop - gap - margin
  const wanted = contentHeight ?? Infinity
  if (wanted <= below || (below >= above && below >= minHeight)) {
    return { top: anchorBottom + gap, maxHeight: below, side: "below" }
  }
  if (above >= minHeight || (above > below && above > 0)) {
    const height = Math.min(wanted, above)
    return { top: anchorTop - gap - height, maxHeight: height, side: "above" }
  }
  const height = Math.max(Math.min(wanted, viewportHeight - 2 * margin), 0)
  return { top: Math.max(margin, viewportHeight - margin - height), maxHeight: height, side: "inside" }
}
