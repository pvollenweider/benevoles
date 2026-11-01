// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Keeps a page working once the browser has translated it (Sentry BENEVOLAPP-Z, 2026-10-31).
 *
 * Automatic page translation (Google Translate in Chrome, on iOS too) replaces the text nodes it
 * translates with `<font>` elements. React still holds the original text nodes: the next update
 * that removes one of them, or inserts a node before one, calls removeChild or insertBefore with a
 * node that is no longer a child of that parent. The browser throws `NotFoundError`, and the error
 * boundary replaces the whole page: a volunteer could no longer sign up.
 *
 * With this guard, those two calls do nothing in exactly that case, instead of throwing (the
 * workaround of facebook/react#11538). Every other call goes to the browser's own method, with its
 * own errors. The text the translator replaced can stay as it was until it translates again; the
 * texts that change on every click are written as one string so React rewrites them whole
 * (src/lib/continue-label.ts). Installed from instrumentation-client.ts, before hydration.
 *
 * Dependency-free on purpose: it runs on every page, before anything else.
 */

const INSTALLED = Symbol.for("benevol.translationDomGuard")

/** How many skipped operations a page load reports, as warnings (Sentry keeps them as breadcrumbs). */
export const MAX_REPORTS = 3

type NodePrototype = Pick<Node, "removeChild" | "insertBefore"> & { [INSTALLED]?: true }

export type GuardReport = (operation: "removeChild" | "insertBefore") => void

const defaultReport: GuardReport = (operation) => {
  // No node or text in the message: translated page content stays out of the logs.
  console.warn(`${operation} skipped: the node was moved by the page translation`)
}

/**
 * Patches `proto` (Node.prototype in the browser) once; a second call does nothing. Returns whether
 * it patched. `report` is called for the first MAX_REPORTS skipped operations.
 */
export function installTranslationDomGuard(proto: NodePrototype, report: GuardReport = defaultReport): boolean {
  if (proto[INSTALLED]) return false
  Object.defineProperty(proto, INSTALLED, { value: true, configurable: true })
  let reports = 0
  const skipped = (operation: "removeChild" | "insertBefore") => {
    if (reports >= MAX_REPORTS) return
    reports++
    try {
      report(operation)
    } catch {
      // Reporting never breaks the page it protects.
    }
  }

  const removeChild = proto.removeChild
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child && child.parentNode !== this) {
      skipped("removeChild")
      return child
    }
    return removeChild.call(this, child) as T
  }

  const insertBefore = proto.insertBefore
  proto.insertBefore = function <T extends Node>(this: Node, node: T, child: Node | null): T {
    if (child && child.parentNode !== this) {
      skipped("insertBefore")
      return node
    }
    return insertBefore.call(this, node, child) as T
  }
  return true
}
