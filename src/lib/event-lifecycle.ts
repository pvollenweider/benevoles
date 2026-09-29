// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The lifecycle of an event in five readable stages (#371): Brouillon → Prêt à publier → Publié →
 * Terminé → Archivé. « Prêt à publier » is a draft that already passes the publication rule
 * (at least one live shift); « Terminé » is a published event whose last day is over. For the
 * current stage, what is still needed and what it concretely means for volunteers. Pure.
 */

export const LIFECYCLE_STAGES = [
  { id: "draft", label: "Brouillon" },
  { id: "ready", label: "Prêt à publier" },
  { id: "published", label: "Publié" },
  { id: "finished", label: "Terminé" },
  { id: "archived", label: "Archivé" },
] as const

export type StageId = (typeof LIFECYCLE_STAGES)[number]["id"]

export type LifecycleFacts = {
  publicStatus: string
  isListed: boolean
  /** "YYYY-MM-DD" */
  endDate: string
  /** "YYYY-MM-DD", today. */
  today: string
  shiftCount: number
  confirmationMessage: string | null
  remindersEnabled: boolean
}

export function currentStage(f: LifecycleFacts): StageId {
  if (f.publicStatus === "archived") return "archived"
  if (f.publicStatus === "published") return f.today > f.endDate ? "finished" : "published"
  return f.shiftCount > 0 ? "ready" : "draft"
}

export type LifecycleStep = { id: StageId; label: string; state: "done" | "current" | "todo" }

export function lifecycleSteps(f: LifecycleFacts): LifecycleStep[] {
  const current = LIFECYCLE_STAGES.findIndex((s) => s.id === currentStage(f))
  return LIFECYCLE_STAGES.map((s, i) => ({ id: s.id, label: s.label, state: i < current ? "done" : i === current ? "current" : "todo" }))
}

/** A sentence, with an optional linked action inside it so the link text names a destination. */
export type LifecycleNote = { before?: string; action?: { label: string; href: string }; after?: string }
export type LifecycleNotes = { needs: LifecycleNote[]; consequences: string[] }

/** The whole sentence of a note, for tests and plain-text uses. */
export const noteText = (n: LifecycleNote) => `${n.before ?? ""}${n.action?.label ?? ""}${n.after ?? ""}`

/** What the current stage still needs (with where to do it) and what it means for volunteers. */
export function lifecycleNotes(f: LifecycleFacts, eventId: string): LifecycleNotes {
  const base = `/admin/events/${eventId}`
  const noConfirmation = !f.confirmationMessage?.trim()
  const reminders = f.remindersEnabled ? "Les rappels partent avant chaque créneau." : "Les rappels sont désactivés."
  switch (currentStage(f)) {
    case "draft":
      return {
        needs: [{ before: "Aucun créneau : ", action: { label: "ajoutez au moins un créneau", href: `${base}/shifts` }, after: " pour pouvoir publier." }],
        consequences: ["Invisible pour les bénévoles, aucune inscription possible.", "Aucun rappel n'est envoyé."],
      }
    case "ready":
      return {
        needs: noConfirmation ? [{ before: "Facultatif : la page publique n'a pas de message de confirmation. ", action: { label: "Ajouter un message de confirmation", href: `${base}/edit` } }] : [],
        consequences: ["Toujours invisible pour les bénévoles : publiez pour ouvrir les inscriptions.", "Aucun rappel n'est envoyé."],
      }
    case "published":
      return {
        needs: noConfirmation ? [{ before: "Facultatif : la page publique n'a pas de message de confirmation. ", action: { label: "Ajouter un message de confirmation", href: `${base}/edit` } }] : [],
        consequences: [
          f.isListed ? "Visible sur la page publique de l'organisation, inscriptions ouvertes." : "Accessible par son lien seulement (non répertorié), inscriptions ouvertes.",
          reminders,
        ],
      }
    case "finished":
      return {
        needs: [{ before: "L'événement est passé : archivez-le (bouton Archiver, en haut) pour le clore." }],
        consequences: ["Toujours visible pour les bénévoles tant qu'il n'est pas archivé.", "La suppression définitive n'est possible qu'une fois archivé."],
      }
    case "archived":
      return {
        needs: [],
        consequences: ["Invisible pour les bénévoles, inscriptions fermées, aucun rappel.", "La suppression définitive est possible, en bas de cette page."],
      }
  }
}
