// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * How an important form explains a failure (#375): what kind it is (their input, a business
 * conflict, the network, the server), whether trying again makes sense, and whether the action
 * may have been recorded anyway. Built on the API error shape `{ error, details? }`.
 */

export type FailureKind = "validation" | "conflict" | "rate_limit" | "network" | "server"

export type Failure = {
  kind: FailureKind
  title: string
  /** The server's own sentence when it has one, else a generic one. */
  message: string
  /** What to do now. */
  hint: string
  retryable: boolean
  /** The request may have reached the server: a timeout after the commit, an unreadable answer. */
  maybeRecorded: boolean
}

export type FailureInput = {
  /** HTTP status; absent when the request never got an answer. */
  status?: number
  body?: { error?: unknown } | null
  /** fetch threw, or the answer wasn't JSON. */
  network?: boolean
}

const serverMessage = (body: FailureInput["body"]) => (typeof body?.error === "string" && body.error.trim() ? body.error.trim() : null)

/** A failure of a volunteer's sign-up: retrying is safe, the server re-sends the link instead of duplicating. */
export function describeSignupFailure(i: FailureInput): Failure {
  const msg = serverMessage(i.body)
  if (i.network || i.status === undefined) {
    return {
      kind: "network", title: "Connexion interrompue",
      message: "Ton inscription n'a peut-être pas été reçue.",
      hint: "Vérifie ton réseau puis confirme à nouveau : c'est sans risque, si l'inscription était passée tu recevras simplement ton lien par email.",
      retryable: true, maybeRecorded: true,
    }
  }
  if (i.status === 400) {
    return { kind: "validation", title: "Un champ est à corriger", message: msg ?? "Certaines informations sont invalides.", hint: "Corrige l'information signalée ci-dessus ; tes autres réponses sont conservées.", retryable: false, maybeRecorded: false }
  }
  if (i.status === 409) {
    return { kind: "conflict", title: "Ta sélection n'est plus disponible", message: msg ?? "Un créneau choisi n'est plus disponible.", hint: "Reviens au planning pour ajuster ton choix ; tes informations restent remplies.", retryable: false, maybeRecorded: false }
  }
  if (i.status === 429) {
    return { kind: "rate_limit", title: "Trop de tentatives", message: msg ?? "Trop de tentatives en peu de temps.", hint: "Patiente quelques minutes, puis confirme à nouveau.", retryable: false, maybeRecorded: false }
  }
  return {
    kind: "server", title: "Ton inscription n'a pas pu être enregistrée",
    message: msg ?? "Une erreur est survenue de notre côté.",
    hint: "Confirme à nouveau dans un instant : si l'inscription était passée malgré tout, tu recevras ton lien par email au lieu d'un doublon.",
    retryable: true, maybeRecorded: i.status >= 500,
  }
}

/** A failure of an admin bulk action: partial results are reported by the caller, this is the whole-request case. */
export function describeBulkFailure(i: FailureInput, what: string): Failure {
  const msg = serverMessage(i.body)
  if (i.network || i.status === undefined) {
    return { kind: "network", title: "Connexion interrompue", message: `${what} : la demande n'a peut-être pas été reçue.`, hint: "L'action a peut-être été appliquée. Rechargez la liste pour vérifier, ou réessayez : les lignes déjà traitées sont ignorées.", retryable: true, maybeRecorded: true }
  }
  if (i.status === 400 || i.status === 409) {
    return { kind: i.status === 400 ? "validation" : "conflict", title: `${what} : refusé`, message: msg ?? "La demande a été refusée.", hint: "Rien n'a été appliqué.", retryable: false, maybeRecorded: false }
  }
  if (i.status === 429) {
    return { kind: "rate_limit", title: "Trop de demandes", message: msg ?? "Trop de demandes en peu de temps.", hint: "Patientez une minute puis réessayez.", retryable: true, maybeRecorded: false }
  }
  return { kind: "server", title: `${what} : erreur du serveur`, message: msg ?? "Une erreur est survenue de notre côté.", hint: "L'action a peut-être été appliquée. Rechargez la liste pour vérifier, ou réessayez : les lignes déjà traitées sont ignorées.", retryable: true, maybeRecorded: i.status >= 500 }
}

/** « 3 appliqués, 1 en échec » for a bulk answer that did part of the work. */
export function partialOutcome(done: number, failed: number, noun = "inscription"): string | null {
  if (failed === 0) return null
  const n = (k: number) => `${k} ${noun}${k > 1 ? "s" : ""}`
  return `${n(done)} traitée${done > 1 ? "s" : ""}, ${n(failed)} en échec : rechargez la liste et réessayez sur celles qui restent.`
}

/** What a failed merge answer means for the organizer: refused, not applied, or unknown. */
export function mergeFailureMessage(status: number, body: { error?: string; notApplied?: boolean } | null): string {
  if (body?.notApplied) return body.error ?? "La fusion n'a pas pu être faite. Rien n'a été modifié."
  if (!body) return "Fusion : erreur du serveur. Rechargez la fiche pour vérifier si la fusion a eu lieu avant de réessayer."
  return describeBulkFailure({ status, body }, "Fusion").message
}
