// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Places of an event (#1171, lot 2): where missions happen (a stage, a tent, a depot), for the
 * travel margin of the workload protection. Separate from sectors, which group mission types.
 * Pure (the shifts page and its tests read it).
 */

export const PLACE_NAME_MAX = 60
export const PLACE_NAME_TAKEN_ERROR = "Un lieu porte déjà ce nom dans cet événement."
export const PLACE_NOT_FOUND_ERROR = "Lieu introuvable."
export const PLACE_ARCHIVED_ERROR = "Ce lieu est archivé : rétablissez-le avant d'y placer un créneau."

/** The label of a shift without a place, and what it means for the travel margin. */
export const NO_PLACE_LABEL = "Aucun lieu (trajet non vérifié)"

export type PlaceLike = { id: string; name: string; displayOrder?: number; archivedAt?: Date | string | null }

/** A typed name, spaces collapsed; null when empty or too long. */
export function placeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const name = raw.replace(/\s+/g, " ").trim()
  return name.length >= 1 && name.length <= PLACE_NAME_MAX ? name : null
}

/** The key the database compares names with (lower(trim(name)), EventPlace_eventId_name_ci_key). */
export const placeKey = (name: string) => name.trim().toLocaleLowerCase("fr-FR")

/** Whether an active place already has this name (case and spaces ignored). */
export function placeNameTaken(places: PlaceLike[], name: string, exceptId?: string): boolean {
  const key = placeKey(name)
  return places.some((p) => p.id !== exceptId && !p.archivedAt && placeKey(p.name) === key)
}

/** Active places first in their order, then the archived ones, for lists and selects. */
export function orderedPlaces<P extends PlaceLike>(places: P[]): P[] {
  const order = (p: P) => p.displayOrder ?? 0
  return [...places].sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt) || order(a) - order(b) || a.name.localeCompare(b.name, "fr"))
}

/** The places a shift can be given: the active ones, plus its own current place even if archived. */
export function selectablePlaces<P extends PlaceLike>(places: P[], currentId: string | null | undefined): P[] {
  return orderedPlaces(places).filter((p) => !p.archivedAt || p.id === currentId)
}

/**
 * Why a shift cannot take `placeId` (#1171, lot 2), or null: none is always fine; a place must be
 * one of the event's; an archived one is kept on the shifts that have it, never given to others.
 */
export function placeChoiceProblem(places: PlaceLike[], placeId: string | null | undefined, currentId: string | null | undefined): string | null {
  if (!placeId) return null
  const place = places.find((p) => p.id === placeId)
  if (!place) return PLACE_NOT_FOUND_ERROR
  if (place.archivedAt && placeId !== currentId) return PLACE_ARCHIVED_ERROR
  return null
}
