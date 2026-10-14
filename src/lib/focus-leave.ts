// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/** What the check needs of a DOM node: `Node.contains` and, for an element, its `tabIndex`. */
export type FocusNode = { contains(other: FocusNode | null): boolean; tabIndex?: number }

/**
 * Whether focus, moving to `next` (a `focusout`'s `relatedTarget`), really left `container` (a
 * non-modal popover that closes when focus goes to another control of the page).
 *
 * Not when `next` is inside it, nor when nothing takes focus (window switch), nor when `next` is
 * an ancestor of it outside the tab order (#987): on iPhone (WebKit) a tapped button does not
 * take focus, which falls back to the nearest focusable ancestor, the admin's `<main tabIndex={-1}>`. Taking that for a
 * departure closed the popover on pointer down, before the tap's click: its buttons, « Supprimer
 * le créneau » first, did nothing. A click on the popover's own padding does the same on every
 * engine. An ancestor in the tab order (`tabIndex` 0 or more) was reached on purpose, with
 * Shift+Tab: that is leaving. A tap or click outside is the outside-pointer handler's job.
 */
export function focusLeftContainer(container: FocusNode | null, next: FocusNode | null): boolean {
  if (!container || !next) return false
  if (container.contains(next)) return false
  if (next.contains(container) && (next.tabIndex ?? -1) < 0) return false
  return true
}
