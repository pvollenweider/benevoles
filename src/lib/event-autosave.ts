// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Autosave status of the event edit form (#616): texts for each state and the announce policy.
// Pure so the Vitest below exercises it without rendering the form.

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; reason: "server" | "network" }

/** « 14h32 », « 9h » (no minutes when round), matching `fmtHour` elsewhere in the admin. */
export function formatSavedAt(date: Date): string {
  const h = date.getHours()
  const m = date.getMinutes()
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`
}

/** The small visible line, always one text for the current state. */
export function visibleSaveText(s: SaveState): string {
  switch (s.kind) {
    case "idle": return ""
    case "saving": return "Enregistrement…"
    case "saved": return `Modifications enregistrées à ${s.at}.`
    case "error": return "Modifications non enregistrées."
  }
}

/** The alert's detail, next to « Réessayer ». */
export function saveErrorText(reason: "server" | "network"): string {
  return reason === "network"
    ? "Connexion impossible : les modifications n'ont pas été enregistrées."
    : "Les modifications n'ont pas été enregistrées."
}

/**
 * OWNER DECISION D11 (b): announce « Modifications enregistrées. » for the first save after load,
 * and the first save after an error; later saves only update the visible time, silently.
 * `previous` is the save state's `kind` just before this success; `announcedOnce` tracks whether
 * a save has ever been announced yet.
 */
export function shouldAnnounceSaved(previous: SaveState["kind"], announcedOnce: boolean): boolean {
  return !announcedOnce || previous === "error"
}
