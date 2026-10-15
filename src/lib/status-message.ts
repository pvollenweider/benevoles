// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The boxes that say how an action went (« Membre enregistré. », an error), shared by the admin
 * screens so they all read the same: a light tint with the text in the same hue (DESIGN.md,
 * paires de statut), never grey text on a coloured box. Classes only: each screen keeps its own
 * element, role (status or alert), ref and focus. Pure, no Prisma: used by client components.
 */
export type StatusBoxKind = "success" | "error" | "info" | "warning"

export const STATUS_BOX_TONE: Record<StatusBoxKind, string> = {
  success: "text-green-800 bg-green-50 border-green-200",
  error: "text-red-800 bg-red-50 border-red-200",
  info: "text-blue-800 bg-blue-50 border-blue-200",
  warning: "text-amber-900 bg-amber-50 border-amber-200",
}

/** A visible status box of this kind: text size, radius, padding, border and the kind's colours. */
export function statusBoxClass(kind: StatusBoxKind): string {
  return `text-sm rounded-xl px-3 py-2 border ${STATUS_BOX_TONE[kind]}`
}

/**
 * The outcome line of a screen: hidden (`sr-only`, the live region stays mounted) until there is
 * an outcome, then a success or error box. The caller adds `focus:outline-none` next to its
 * `tabIndex={-1}` (a code-focus target, DESIGN.md §4).
 */
export function outcomeClass(outcome: { kind: string } | null | undefined): string {
  if (!outcome) return "sr-only"
  return statusBoxClass(outcome.kind === "error" ? "error" : "success")
}
