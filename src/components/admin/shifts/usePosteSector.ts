"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import {
  effectiveSector, newPosteSectorHint, posteFollowHint, posteSectorMessage, posteSectorMismatch,
  posteSuggestionsInSector, switchSectorLabel, typedPosteSector, type PosteSectorMismatch, type PosteSectorShift,
} from "@/lib/poste-sector"
import { matchingPoste, posteSuggestions } from "@/lib/poste-suggestions"

export type SectorOption = { id: string; name: string }

/**
 * The « Secteur » select of a shift form (#1147) that creates shifts for a poste: one shift
 * (ShiftEditor), a series or a weekly permanence. Shared so the three forms follow one rule:
 * - `sectors` null (the event has not adopted sectors): no select, nothing sent;
 * - every sector archived (`sectors` empty): no select, the new poste goes to « Autres postes »;
 * - until the organiser chooses a sector (preset by « Ajouter un poste dans « S » », or changed by
 *   hand), the select follows the existing poste typed, with no message; a new name keeps its value;
 * - once chosen, an existing poste of another sector is never moved: the form says where it is,
 *   offers to switch the select, and saving waits (`mismatch`).
 */
export function usePosteSector({ sectors, presetSector = null, existingShifts, roleName }: {
  sectors: SectorOption[] | null
  presetSector?: SectorOption | null
  existingShifts: readonly PosteSectorShift[]
  /** The poste field's current value. */
  roleName: string
}) {
  const send = !!sectors
  const shown = send && sectors.length > 0
  const activeIds = new Set((sectors ?? []).map((s) => s.id))
  const [value, setValue] = useState(presetSector?.id ?? "")
  const [chosen, setChosen] = useState(!!presetSector)
  // A sector archived while the form is open is no destination any more: « Autres postes ».
  const current = value && activeIds.has(value) ? value : null
  const nameOf = (id: string | null) => (id ? sectors?.find((s) => s.id === id)?.name ?? null : null)
  const poste = matchingPoste(existingShifts, roleName)
  const mismatch: PosteSectorMismatch | null = shown && chosen ? posteSectorMismatch(existingShifts, roleName, current, activeIds) : null
  // The select follows this poste: its sector is said under the poste field, with its settings.
  const following = shown && !chosen && poste !== null

  return {
    /** Whether the request carries `sectorId` (the event adopted sectors). */
    send,
    /** Whether the select is drawn (an active sector to choose). */
    shown,
    /** The sector sent: an active sector, or null for « Autres postes ». */
    sectorId: current,
    sectorName: nameOf(current),
    nameOf,
    mismatch,
    /** The select follows the existing poste typed (not chosen yet). */
    following,
    /** The organiser changed the select by hand: it is chosen from now on. */
    choose(next: string) {
      setValue(next)
      setChosen(true)
    },
    /** The poste field changed: an unchosen select follows the existing poste typed. */
    followPoste(typed: string) {
      if (!shown) return
      setValue(effectiveSector(chosen, typedPosteSector(existingShifts, typed, activeIds), current) ?? "")
    },
    /** « Utiliser ce poste dans « S » »: the select takes the poste's sector. */
    switchToPoste() {
      if (mismatch) setValue(mismatch.sectorId ?? "")
    },
    /**
     * The poste suggestions: every poste of the event while the select follows (any of them can be
     * typed), those of the chosen sector once chosen (another would only bring the message).
     */
    suggestions: shown && chosen ? posteSuggestionsInSector(existingShifts, current, activeIds) : posteSuggestions(existingShifts),
    /** Under the poste field: the mismatch, or where the followed poste is; null for the plain settings hint. */
    message: mismatch ? posteSectorMessage(mismatch.poste, nameOf(mismatch.sectorId)) : following ? posteFollowHint(poste, nameOf(current)) : null,
    switchLabel: mismatch ? switchSectorLabel(nameOf(mismatch.sectorId)) : null,
    /** What saving creates while the poste typed is new (null otherwise). */
    newPosteHint: (many = false) => (shown && !poste && roleName.trim() ? newPosteSectorHint(nameOf(current), many) : null),
  }
}
