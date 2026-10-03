// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { canTakeFocus } from "./focus-return"

/**
 * Focus trap of a dialog (#585): what Tab can reach inside it, and where Tab or Shift+Tab must wrap.
 * Pure DOM reads, no listener: `ModalShell` owns the keydown handler.
 */

const CANDIDATES = 'a[href], button, input, select, textarea, summary, [tabindex]'

/**
 * Elements Tab reaches inside `root`, in document order: natively focusable or with a `tabindex`
 * of 0 or more, able to take focus (`canTakeFocus`: not `[hidden]`, `inert`, `aria-hidden`,
 * `display: none`, `visibility: hidden` or `:disabled`; `aria-disabled` stays), not a hidden input.
 * A radio group is one stop, as in the browser: its checked radio, else its first one.
 */
export function tabbables(root: HTMLElement): HTMLElement[] {
  const found = [...root.querySelectorAll<HTMLElement>(CANDIDATES)].filter((el) => {
    // Only an explicit tabindex can take an element out of the order (jsdom gives -1 to some
    // natively focusable elements, such as <summary>).
    if (el.hasAttribute("tabindex") && el.tabIndex < 0) return false
    if (el instanceof HTMLInputElement && el.type === "hidden") return false
    return canTakeFocus(el)
  })

  const groupStop = new Map<string, HTMLInputElement>()
  for (const el of found) {
    if (!(el instanceof HTMLInputElement) || el.type !== "radio" || !el.name) continue
    const key = radioGroupKey(el)
    const current = groupStop.get(key)
    if (!current || (el.checked && !current.checked)) groupStop.set(key, el)
  }
  return found.filter((el) =>
    !(el instanceof HTMLInputElement) || el.type !== "radio" || !el.name || groupStop.get(radioGroupKey(el)) === el,
  )
}

function radioGroupKey(el: HTMLInputElement): string {
  // Same name in two forms is two groups; the form is told apart by its position in the list.
  const form = el.form
  const formIndex = form ? [...el.ownerDocument.forms].indexOf(form) : -1
  return `${formIndex}\u0000${el.name}`
}

/**
 * Where Tab (or Shift+Tab with `backwards`) must send focus to stay inside `root`, or null when the
 * browser can move it itself. Wraps to the first item when nothing tabbable follows the focused
 * element (to the last when nothing precedes it), and starts from the first (or last) when focus
 * is outside `root` (a WebKit tap leaves it on `<main>`). Null when `items` is empty: the caller
 * keeps focus where it is.
 */
export function trapTarget(root: HTMLElement, items: HTMLElement[], active: Element | null, backwards: boolean): HTMLElement | null {
  if (items.length === 0) return null
  const first = items[0]
  const last = items[items.length - 1]
  if (!active || !root.contains(active)) return backwards ? last : first
  if (backwards) {
    const hasBefore = items.some((el) => el !== active && !!(active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING))
    return hasBefore ? null : last
  }
  const hasAfter = items.some((el) => el !== active && !!(active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))
  return hasAfter ? null : first
}
