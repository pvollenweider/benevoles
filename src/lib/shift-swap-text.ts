// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { deadlineMoment } from "./cancel-deadline"
import { dayLabel, spokenTimeRange } from "./spoken-time"
import type { MySwap, SwapShiftView } from "./shift-swap-view"

/**
 * The words of shift swaps (#1174), on the volunteer's personal page (« tu ») and the organisers'
 * screens (« vous »). Pure: client components import it. The states follow the framing:
 * « En attente de la réponse de … », « Nouvel accord nécessaire », « Validation attendue »,
 * « Échange effectué », « Refusé ou retiré », « Expiré », « Devenu impossible ».
 */

export const SWAPS_SECTION_TITLE = "Échanger un créneau"
export const SWAPS_SECTION_ID = "echanges"
export const SWAPS_INTRO = "Tu ne peux plus venir ? Propose d'échanger ton créneau avec une personne inscrite sur le même poste. Rien ne change tant que l'échange n'est pas effectué."
export const SWAPS_MINE_TITLE = "Mes échanges"
export const SWAPS_PUBLISH_TITLE = "Proposer un échange"
export const SWAPS_PUBLISH_BUTTON = "Je cherche à échanger ce créneau"
export const SWAPS_OFFERS_TITLE = "Échanges proposés par d'autres bénévoles"
export const SWAPS_OFFER_BUTTON = "Proposer cet échange"
export const SWAPS_NEW_TERMS = "La proposition a changé : relis les deux créneaux avant de confirmer."

/** « samedi 4 juillet, de 10h à 12h »: a shift's day and hours, in words. */
export function swapWhen(s: Pick<SwapShiftView, "date" | "startTime" | "endTime">): string {
  const day = dayLabel(s.date)
  return `${day.charAt(0).toLowerCase()}${day.slice(1)}, ${spokenTimeRange(s.startTime, s.endTime)}`
}

/** « Bar, Soir » or « Bar »: the poste and the shift's own label when it differs. */
export function swapMission(s: Pick<SwapShiftView, "roleName" | "label">): string {
  return s.label && s.label !== s.roleName ? `${s.roleName}, ${s.label}` : s.roleName
}

/**
 * The heading of one of my requests: its state, then the shift I give, so that two requests in the
 * same state stay apart in a list of headings. `name` is how to write the other person (the page
 * passes the printed or the spoken form).
 */
export function swapStateHeading(m: Pick<MySwap, "side" | "status" | "otherName" | "gives">, name: (n: string) => string = (n) => n): string {
  return `${swapState(m, name)} : ${swapMission(m.gives)}, ${swapShortWhen(m.gives)}`
}

/** « sam. 4 juil. » style short day, as the cards show it. */
export function swapShortWhen(s: Pick<SwapShiftView, "date">): string {
  const day = dayLabel(s.date)
  return `${day.charAt(0).toLowerCase()}${day.slice(1)}`
}

/** The state alone, by side. */
export function swapState(m: Pick<MySwap, "side" | "status" | "otherName">, name: (n: string) => string = (n) => n): string {
  const other = m.otherName ? name(m.otherName) : "l'autre bénévole"
  switch (m.status) {
    case "open": return "En attente d'une proposition"
    case "offered": return m.side === "requester" ? `${other} te propose un échange` : `En attente de la réponse de ${other}`
    case "approval": return "En attente de la validation de l'organisation"
    case "applied": return "Échange effectué"
    case "withdrawn": return "Retiré"
    case "refused": return "Refusé par l'organisation"
    case "expired": return "Expiré"
    case "impossible": return "Devenu impossible"
    case "cancelled": return "Annulé par l'organisation"
  }
}

/** The sentence under the heading: what happens next, or what happened. */
export function swapStateText(m: Pick<MySwap, "side" | "status" | "deadline" | "endMessage">, timeZone: string): string {
  const until = deadlineMoment(new Date(m.deadline), timeZone)
  switch (m.status) {
    case "open": return `Les personnes inscrites sur un autre créneau de ce poste peuvent te proposer le leur, jusqu'au ${until}. Ton créneau ne change pas d'ici là.`
    case "offered": return m.side === "requester"
      ? `Relis les deux créneaux, puis accepte ou refuse avant le ${until}. Tes créneaux restent inchangés d'ici là.`
      : `Tes créneaux restent inchangés tant que la réponse n'est pas arrivée, au plus tard le ${until}.`
    case "approval": return `Vous êtes d'accord tous les deux. L'échange doit encore être validé par l'organisation avant le ${until}. Ton planning n'a pas changé.`
    case "applied": return "Voici ton nouvel horaire : il est aussi dans « Tous mes créneaux »."
    case "withdrawn":
    case "refused": return m.endMessage ? `${m.endMessage} Tu conserves ton créneau.` : "L'échange n'a pas eu lieu. Tu conserves ton créneau."
    case "expired": return "La demande a expiré. Tu conserves ton créneau."
    case "impossible": return `L'échange ne peut plus être effectué${m.endMessage ? ` : ${m.endMessage.replace(/^./, (c) => c.toLowerCase()).replace(/\.$/, "")}` : ""}. Tu conserves ton créneau.`
    case "cancelled": return "L'organisation a désactivé les échanges pour cet événement. Tu conserves ton créneau."
  }
}

/** What the page says once an action went through (role=status). */
export function swapDoneText(action: "publish" | "offer" | "confirm" | "decline" | "withdraw_offer" | "withdraw", status: string, received?: Pick<SwapShiftView, "roleName" | "label" | "date" | "startTime" | "endTime"> | null): string {
  switch (action) {
    case "publish": return "Demande publiée : les personnes du même poste peuvent te proposer un échange."
    case "offer": return "Proposition envoyée : l'autre personne doit maintenant répondre."
    case "confirm": return status === "applied"
      ? received ? `Échange effectué : ton créneau est maintenant ${swapMission(received)}, ${swapWhen(received)}.` : "Échange effectué."
      : "Échange accepté : il attend maintenant la validation de l'organisation."
    case "decline": return "Proposition refusée : tu conserves ton créneau."
    case "withdraw_offer": return "Proposition retirée : tu conserves ton créneau."
    case "withdraw": return "Demande retirée : tu conserves ton créneau."
  }
}

/** The organisers' event option. */
export const SWAPS_OPTION_LABEL = "Autoriser les demandes d'échange de créneaux"
export const SWAPS_APPROVAL_LABEL = "Valider chaque échange"
export const SWAPS_OPTION_HINT = "Deux bénévoles confirmés sur le même poste peuvent échanger leurs créneaux depuis leur page « Mes inscriptions ». Un échange qui touche un créneau « sur validation » attend toujours votre accord."
export const SWAPS_APPROVAL_HINT = "Chaque échange attend votre accord, même entre deux créneaux ordinaires. Vous le validez dans la page Inscriptions."
export const SWAPS_OFF_WARNING = "Les demandes en cours seront annulées et les personnes concernées prévenues par email. Les échanges déjà effectués restent."
