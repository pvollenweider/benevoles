// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode, Ref } from "react"

/**
 * An on/off setting with an immediate effect (DESIGN.md §5, « Interrupteur »): one
 * `<button role="switch" aria-checked>` holding a small track and its visible label, without a
 * frame, so the whole line is the 44 px target and the accessible name is the label, which never
 * changes with the state. Used on public pages (« Voir qui est inscrit » on the event page,
 * « Afficher mon nom aux autres bénévoles » on the personal page, #1068); the admin's switch
 * (OrgCharterForm) is the same vocabulary.
 *
 * Forced colours paint both fills in Canvas: the track's border and the system colours on the
 * track and knob only (never on the button, whose text must stay CanvasText) keep « on » and
 * « off » apart there (WCAG 1.4.11). The state is never colour alone: the knob's side, the fill,
 * and, where the state matters, a text next to the switch (`describedBy`). While `busy`, the switch
 * stays focusable (aria-disabled, never disabled) and `onToggle` is not called.
 */
export default function Switch({ checked, onToggle, children, describedBy, busy = false, buttonRef, className = "", ...data }: {
  checked: boolean
  onToggle: () => void
  /** The visible label, also the accessible name. */
  children: ReactNode
  describedBy?: string
  busy?: boolean
  buttonRef?: Ref<HTMLButtonElement>
  className?: string
} & { [key: `data-${string}`]: string | boolean | undefined }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      aria-disabled={busy || undefined}
      onClick={() => { if (!busy) onToggle() }}
      className={`group inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl text-left text-sm font-medium text-gray-700 hover:text-gray-900 aria-disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${className}`}
      {...data}
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors motion-safe:duration-150 forced-colors:border-[CanvasText] forced-colors:group-aria-checked:bg-[Highlight] ${checked ? "border-blue-600 bg-blue-600" : "border-gray-500 bg-white group-hover:bg-gray-100"}`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full shadow-sm motion-safe:transition-transform motion-safe:duration-150 forced-colors:bg-[CanvasText] forced-colors:group-aria-checked:bg-[HighlightText] ${checked ? "translate-x-4 bg-white" : "translate-x-0.5 bg-gray-600"}`}
        />
      </span>
      <span className="min-w-0">{children}</span>
    </button>
  )
}
