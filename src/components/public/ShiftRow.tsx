"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { fmt } from "@/lib/gantt-utils"
import { withdrawCopy } from "@/lib/volunteer-withdraw"

/** What a selected-shift row shows of a shift. */
export type ShiftRowShift = {
  id: string
  roleName: string
  label: string
  startTime: string
  endTime: string
  status: string
  waitlistEnabled: boolean
  requiresApproval?: boolean
  minAge: number | null
}

type Props = {
  shift: ShiftRowShift
  /** Desktop sidebar: tighter vertical padding. */
  compact?: boolean
  /** Already held by the visitor (green row, the button cancels the registration). */
  registered: boolean
  /**
   * Status of the visitor's registration on a held shift (active, requested, waiting, offered):
   * the cancel button is named after what it withdraws.
   */
  status?: string
  /** In the current selection (blue row). */
  selected: boolean
  /** Held shift: asks to cancel; gets the button, to find its list and give focus back to it. */
  onCancel: (trigger: HTMLButtonElement) => void
  /** Selected shift: takes it out of the selection. */
  onRemove: () => void
}

/**
 * A selected or held shift on the public sign-up page, in the mobile summary card and the desktop
 * sidebar.
 */
export default function ShiftRow({ shift: s, compact = false, registered: isReg, status = "active", selected, onCancel, onRemove }: Props) {
  const isWaitlistPending = !isReg && s.status === "full" && (s.waitlistEnabled ?? false)
  const name = s.label && s.label !== s.roleName ? s.label : s.roleName
  return (
    <div className={`flex items-start gap-2 px-4 transition-colors duration-150 ${compact ? "py-2" : "py-2.5"} ${isReg ? "bg-green-50" : selected ? "bg-blue-50/60" : ""}`}>
      <svg aria-hidden="true" className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${isReg ? "text-green-400" : "text-blue-400"}`} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium leading-snug ${isReg ? "text-green-900" : "text-gray-900"}`}>{name}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 font-mono">{fmt(s.startTime)}–{fmt(s.endTime)}</p>
        {s.minAge != null && (
          <p className="text-[11px] text-amber-700 mt-0.5 font-medium">{s.minAge} ans minimum</p>
        )}
        {isWaitlistPending && (
          <p className="text-[11px] text-gray-500 mt-0.5">Complet · liste d&apos;attente si place libérée</p>
        )}
        {!isReg && !isWaitlistPending && s.requiresApproval && (
          <p className="text-xs text-amber-800 mt-0.5 font-medium">Sur validation · demande à accepter par l&apos;organisation</p>
        )}
      </div>
      {/* Icon-only ✕: at least 24 × 24 px (2.5.8), the icon at least 3:1 against its row (1.4.11). */}
      {isReg ? (
        <button
          type="button"
          data-withdraw-trigger={s.id}
          onClick={(e) => onCancel(e.currentTarget as HTMLButtonElement)}
          className="-mt-0.5 -mr-1 min-h-6 min-w-6 inline-flex items-center justify-center rounded-md text-sm leading-none flex-shrink-0 text-green-800 hover:text-red-700 hover:bg-green-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700"
          aria-label={withdrawCopy(status, name).ariaLabel}
        ><span aria-hidden="true">✕</span></button>
      ) : (
        <button
          type="button"
          onClick={() => onRemove()}
          className="-mt-0.5 -mr-1 min-h-6 min-w-6 inline-flex items-center justify-center rounded-md text-sm leading-none flex-shrink-0 text-blue-700 hover:text-red-700 hover:bg-blue-100 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700"
          aria-label={`Retirer ${name} de la sélection`}
        ><span aria-hidden="true">✕</span></button>
      )}
    </div>
  )
}
