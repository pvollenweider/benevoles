// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Shift swaps between volunteers (#1174): the swap is done (« Tu cèdes … / Tu reçois … »), or a
 * request ended without a swap. Sent through the outbox once the change is committed, to each
 * person with their own personal link; never an action link (those are single-use and POST-only,
 * on the personal page). Never names the other person nor their plan.
 */

import { spokenShift } from "../../spoken-time"
import type { NotificationPayload } from "../types"
import { BASE_URL, myPageUrl, escapeHtml, btn, wrap, type RenderedEmail } from "./shared"

type SwapShiftPart = { roleName: string; label?: string | null; date: string; startTime: string; endTime: string; locationDetails?: string | null; instructions?: string | null }

/** One shift in plain text: when, poste, then place and instructions when the shift has them. */
function shiftLines(s: SwapShiftPart): string[] {
  return [
    spokenShift(s),
    ...(s.locationDetails?.trim() ? [`Lieu : ${s.locationDetails.trim()}`] : []),
    ...(s.instructions?.trim() ? [`À savoir : ${s.instructions.trim()}`] : []),
  ]
}

function shiftHtml(title: string, s: SwapShiftPart): string {
  const [when, ...details] = shiftLines(s)
  return `<p style="margin:1em 0 0.25em;color:#333"><strong>${escapeHtml(title)}</strong></p>
    <ul style="color:#333;padding-left:1.25em;margin:0 0 0.5em"><li>${escapeHtml(when)}${details.map((d) => `<br>${escapeHtml(d)}`).join("")}</li></ul>`
}

// ── Échange effectué ─────────────────────────────────────────────────────────

export function renderShiftSwapApplied(p: NotificationPayload): RenderedEmail {
  const d = p.data as { volunteerName: string; eventTitle: string; orgSlug?: string; gave: SwapShiftPart; received: SwapShiftPart; editToken: string }
  const firstName = d.volunteerName.split(" ")[0]
  const linkUrl = myPageUrl(d.orgSlug, d.editToken)
  const subject = `Échange effectué : ${d.eventTitle}`
  const intro = `Ton échange de créneaux pour ${d.eventTitle} est fait. Voici ton nouvel horaire.`
  const text = [
    `Hello ${firstName},`,
    ``,
    intro,
    ``,
    `Tu reçois :`,
    ...shiftLines(d.received).map((l) => `- ${l}`),
    ``,
    `Tu cèdes :`,
    ...shiftLines(d.gave).map((l) => `- ${l}`),
    ``,
    `Ton lien personnel pour voir et gérer tes inscriptions :`,
    linkUrl,
  ].join("\n")
  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)},</h2>
    <p style="color:#555">${escapeHtml(intro)}</p>
    ${shiftHtml("Tu reçois :", d.received)}
    ${shiftHtml("Tu cèdes :", d.gave)}
    <p style="margin-top:1.5em">${btn(linkUrl, "Voir mes inscriptions")}</p>
  `, `Échange effectué : ${spokenShift(d.received)}.`)
  return { subject, html, text }
}

// ── Échange qui n'a pas eu lieu ─────────────────────────────────────────────

type EndedOutcome = "expired" | "impossible" | "refused" | "cancelled" | "withdrawn" | "declined"

/** What happened, in one sentence, for each way a request ends without a swap. */
export function swapEndedSentence(outcome: EndedOutcome, reason: string | null): string {
  switch (outcome) {
    case "expired": return "La demande d'échange a expiré."
    case "refused": return "L'organisation n'a pas validé l'échange."
    case "cancelled": return "L'organisation a désactivé les échanges de créneaux pour cet événement."
    case "withdrawn": return "L'échange a été retiré."
    case "declined": return "Ta proposition d'échange n'a pas été retenue."
    case "impossible": return `L'échange ne peut plus être effectué${reason ? ` : ${reason.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())}` : ""}.`
  }
}

export function renderShiftSwapEnded(p: NotificationPayload): RenderedEmail {
  const d = p.data as { volunteerName: string; eventTitle: string; orgSlug?: string; outcome: EndedOutcome; reason?: string | null; kept: SwapShiftPart; editToken: string }
  const firstName = d.volunteerName.split(" ")[0]
  const linkUrl = myPageUrl(d.orgSlug, d.editToken)
  const what = swapEndedSentence(d.outcome, d.reason ?? null)
  const subject = `Échange non effectué : ${d.eventTitle}`
  const keep = "Tu conserves ton créneau :"
  const text = [
    `Hello ${firstName},`,
    ``,
    `${what} Rien n'a changé dans tes inscriptions pour ${d.eventTitle}.`,
    ``,
    keep,
    ...shiftLines(d.kept).map((l) => `- ${l}`),
    ``,
    `Ton lien personnel pour voir et gérer tes inscriptions :`,
    linkUrl,
  ].join("\n")
  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)},</h2>
    <p style="color:#555">${escapeHtml(what)} Rien n'a changé dans tes inscriptions pour ${escapeHtml(d.eventTitle)}.</p>
    ${shiftHtml(keep, d.kept)}
    <p style="margin-top:1.5em">${btn(linkUrl, "Voir mes inscriptions")}</p>
  `, `${what} Tu conserves ton créneau.`)
  return { subject, html, text }
}

// ── Proposition reçue ────────────────────────────────────────────────────────

/**
 * To the person who published the request: « Jean D. » offers a swap. Only a link to the personal
 * page, where accepting or refusing is a POST bound to this offer (never an action by the link).
 */
export function renderShiftSwapOffered(p: NotificationPayload): RenderedEmail {
  const d = p.data as { volunteerName: string; eventTitle: string; orgSlug?: string; otherName: string | null; gives: SwapShiftPart; receives: SwapShiftPart; deadline: string; editToken: string }
  const firstName = d.volunteerName.split(" ")[0]
  const linkUrl = `${myPageUrl(d.orgSlug, d.editToken)}#echanges`
  const who = d.otherName?.trim() || "Un ou une bénévole"
  const subject = `Proposition d'échange : ${d.eventTitle}`
  const intro = `${who} te propose d'échanger ton créneau pour ${d.eventTitle}.`
  const answer = `Réponds avant le ${d.deadline} depuis ta page « Mes inscriptions ». Rien ne change tant que tu n'as pas accepté.`
  const text = [
    `Hello ${firstName},`, ``, intro, ``,
    `Tu cèdes :`, ...shiftLines(d.gives).map((l) => `- ${l}`), ``,
    `Tu reçois :`, ...shiftLines(d.receives).map((l) => `- ${l}`), ``,
    answer, linkUrl,
  ].join("\n")
  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)},</h2>
    <p style="color:#555">${escapeHtml(intro)}</p>
    ${shiftHtml("Tu cèdes :", d.gives)}
    ${shiftHtml("Tu reçois :", d.receives)}
    <p style="color:#555">${escapeHtml(answer)}</p>
    <p style="margin-top:1.5em">${btn(linkUrl, "Voir la proposition")}</p>
  `, intro)
  return { subject, html, text }
}

// ── Validation attendue (organisateurs) ─────────────────────────────────────

/** To each active organiser: a swap waits for their approval before its deadline. */
export function renderShiftSwapApprovalNeeded(p: NotificationPayload): RenderedEmail {
  const d = p.data as { eventId: string; eventTitle: string; requester: { name: string; shift: SwapShiftPart }; counterpart: { name: string; shift: SwapShiftPart }; deadline: string }
  const url = `${BASE_URL}/admin/events/${encodeURIComponent(d.eventId)}/registrations#echanges`
  const subject = `Échange de créneaux à valider : ${d.eventTitle}`
  const intro = `Deux bénévoles de ${d.eventTitle} se sont mis d'accord pour échanger leurs créneaux. L'échange attend votre validation avant le ${d.deadline} ; rien ne change d'ici là.`
  const line = (who: string, gives: SwapShiftPart, receives: SwapShiftPart) => `${who} cède ${spokenShift(gives)} et reçoit ${spokenShift(receives)}.`
  const lines = [line(d.requester.name, d.requester.shift, d.counterpart.shift), line(d.counterpart.name, d.counterpart.shift, d.requester.shift)]
  const text = [`Bonjour,`, ``, intro, ``, ...lines.map((l) => `- ${l}`), ``, `Valider ou refuser l'échange :`, url].join("\n")
  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Bonjour,</h2>
    <p style="color:#555">${escapeHtml(intro)}</p>
    <ul style="color:#333;padding-left:1.25em;margin:0.5em 0 1em">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
    <p style="margin-top:1.5em">${btn(url, "Valider ou refuser l'échange")}</p>
  `, intro)
  return { subject, html, text }
}
