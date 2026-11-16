"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NO_SECTOR_OPTION } from "@/lib/sectors"
import type { SectorOption } from "./usePosteSector"

/**
 * The « Secteur » select of the shift forms (#1147), before « Poste »: the event's active sectors,
 * then « Autres postes (aucun secteur) ». Its value and rules come from usePosteSector.
 */
export default function SectorSelect({ ref, id, sectors, value, onChange, describedBy, autoFocus = false }: {
  ref?: React.Ref<HTMLSelectElement>
  id: string
  sectors: SectorOption[]
  value: string
  onChange: (value: string) => void
  describedBy?: string
  autoFocus?: boolean
}) {
  return (
    <div className="sm:w-1/2">
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1">Secteur</label>
      <select ref={ref} id={id} autoFocus={autoFocus} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} className="input">
        {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        <option value="">{NO_SECTOR_OPTION}</option>
      </select>
    </div>
  )
}
