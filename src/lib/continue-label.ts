// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The « Continuer » button of the sign-up page, with the number of shifts newly chosen.
 *
 * One string, rendered as the button's only child: React then rewrites the whole text when the
 * number changes. Written as several pieces (« nouveau », then « x » when there are more than one),
 * React inserted the « x » next to a text node that the browser's automatic translation had
 * already replaced, and the page broke (Sentry BENEVOLAPP-Z, src/lib/translation-dom-guard.ts).
 */
export function continueLabel(newShifts: number): string {
  const plural = newShifts > 1 ? "x" : ""
  return `Continuer (${newShifts} nouveau${plural} créneau${plural})`
}
