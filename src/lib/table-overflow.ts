// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Whether a horizontally scrollable table region actually hides columns (#1102): its content is
 * wider than its visible box. A one-pixel tolerance absorbs sub-pixel rounding (a fractional
 * column width can report scrollWidth one pixel above clientWidth with nothing hidden). A region
 * not laid out yet (clientWidth 0: hidden, or measured before layout) never counts as overflowing.
 */
export function hidesColumns(scrollWidth: number, clientWidth: number): boolean {
  if (!(clientWidth > 0) || !Number.isFinite(scrollWidth)) return false
  return scrollWidth - clientWidth > 1
}

/** The cue shown above a members table that scrolls sideways (#1102). */
export const TABLE_SCROLL_HINT = "Le tableau est plus large que l'écran : faites-le défiler horizontalement pour voir toutes les colonnes (au clavier, sélectionnez-le puis utilisez les flèches gauche et droite)."
