// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * How one row of the public list view looks (#808, list of shifts). The rules of what can be
 * chosen stay those of `shiftViewState` (`public-timeline.ts`); this module only turns the state
 * into classes, so the look of every row is tested without rendering.
 *
 * A row that can be activated (selected and held rows included) is the unchanged card, plus a real
 * 6 px left border in the poste's colour (the timeline's `default` shade, `getListBorderClass`).
 * A row that cannot be activated is quiet: no frame, no ground, no poste colour, grey regular text.
 * Its title and state share one line when they fit and the state wraps under the title otherwise.
 */

import { getListBorderClass } from "./roles"
import type { ShiftViewState } from "./public-timeline"

/** The four looks of a row; `card` and `quiet` are the two kinds, `selected` and `held` are cards. */
export type ShiftListRowKind = "card" | "selected" | "held" | "quiet"

export type ShiftListRowLook = {
  kind: ShiftListRowKind
  /** The button's classes, the poste's left border included on every row that is a card. */
  button: string
  /** The title line. */
  title: string
  /** The line holding the state word (and its check icon on a selected or held row). */
  statusLine: string
  /** The details line, under the others. */
  details: string
  /** The state is the plain « n places libres sur m », which the design highlights. */
  placesStatus: boolean
}

// The focus outline is the same on every row. No `overflow-hidden`: it would cut it.
const BUTTON_BASE = "w-full rounded-xl text-left break-words forced-colors:aria-pressed:border-[Highlight] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
// A card keeps its 2 px frame, its 16 px radius and its 44 px minimum height.
const CARD_BUTTON = `${BUTTON_BASE} min-h-11 border-2 px-4 py-2`
const CARD_TITLE = "block text-base font-medium text-gray-900"
const CARD_DETAILS = "mt-0.5 block text-sm text-gray-700"
// Quiet rows: border-0 (not transparent), transparent ground, 32 px minimum, 6 px vertical padding.
// The left padding is the card's 16 px plus its 6 px left border, so the text starts at the same x.
// Title and state are flex items: state at the right when both fit, wrapped under the title when
// not; from `sm` it follows the title after a fixed gap. The details take their own full line.
const QUIET_BUTTON = `${BUTTON_BASE} flex min-h-8 flex-wrap items-baseline justify-between gap-x-3 border-0 bg-transparent px-4 py-1.5 pl-[22px] font-normal text-gray-500 forced-colors:text-[GrayText] sm:justify-start sm:gap-x-2`
const QUIET_TITLE = "min-w-0 break-words text-[15px]"
const QUIET_STATUS = "min-w-0 break-words text-sm"
const QUIET_DETAILS = "mt-0.5 block w-full min-w-0 break-words text-sm"

function cardStatus(places: boolean): string {
  return `mt-0.5 flex items-center gap-1 text-sm ${places ? "font-semibold text-gray-900" : "text-gray-800"}`
}

/**
 * The look of one list row. `limitReached` is the role's per-person limit when it is reached
 * (#466): the row stays a card, like a full shift with a waiting list, but its status is not the
 * plain places line and keeps the normal weight.
 */
export function shiftListRowLook({
  view,
  roleName,
  colorKey,
  limitReached,
}: {
  view: ShiftViewState
  roleName: string
  colorKey?: string | null
  limitReached?: number
}): ShiftListRowLook {
  const border = `border-l-[6px] ${getListBorderClass(roleName, colorKey)}`

  if (view.held) {
    return {
      kind: "held",
      button: `${CARD_BUTTON} border-green-700 bg-green-50 ${border} cursor-default`,
      title: CARD_TITLE,
      statusLine: cardStatus(false),
      details: CARD_DETAILS,
      placesStatus: false,
    }
  }

  if (view.selected) {
    return {
      kind: "selected",
      button: `${CARD_BUTTON} border-blue-700 bg-blue-50 ${border} cursor-pointer`,
      title: CARD_TITLE,
      statusLine: cardStatus(false),
      details: CARD_DETAILS,
      placesStatus: false,
    }
  }

  if (!view.clickable) {
    return {
      kind: "quiet",
      button: `${QUIET_BUTTON} cursor-default`,
      title: QUIET_TITLE,
      statusLine: QUIET_STATUS,
      details: QUIET_DETAILS,
      placesStatus: false,
    }
  }

  // A card that can be chosen: an open shift, a full one with a waiting list, or one whose role
  // limit is reached (still pressable, the page says why it is not added).
  const places = !view.full && limitReached === undefined
  return {
    kind: "card",
    button: `${CARD_BUTTON} border-gray-300 bg-white hover:bg-gray-50 ${border} cursor-pointer`,
    title: CARD_TITLE,
    statusLine: cardStatus(places),
    details: CARD_DETAILS,
    placesStatus: places,
  }
}
