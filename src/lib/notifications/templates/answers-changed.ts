// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { NotificationPayload } from "../types"
import { digestItems } from "../digest-items"
import type { AnswerChangeItem } from "../../answer-changes"
import { escapeHtml, btn, wrap, adminQuestionsUrl, leaderPageUrl, type RenderedEmail } from "./shared"

/**
 * A volunteer changed their answers from the personal page (#984): one email per event and
 * organiser, grouped like withdrawals (#869). Each volunteer is one line per question, from the
 * answer before their first change to the one after their last.
 */
const value = (v: string | null) => (v ? `« ${v} »` : "pas de réponse")
const changeLine = (c: AnswerChangeItem["changes"][number]) => `« ${c.label} » : ${value(c.from)} → ${value(c.to)}`
const intro = (item: AnswerChangeItem) => `${item.volunteerName} a modifié ${item.changes.length > 1 ? "ses réponses" : "sa réponse"}`

export function renderAnswersChanged(p: NotificationPayload): RenderedEmail {
  const data = p.data as Record<string, unknown>
  const items = digestItems<AnswerChangeItem>(data).filter((i) => i?.changes?.length)
  const eventId = String(data.eventId)
  const eventTitle = String(data.eventTitle)
  const url = adminQuestionsUrl(eventId)
  const one = items.length === 1
  const subject = one ? `${items[0].changes.length > 1 ? "Réponses modifiées" : "Réponse modifiée"} — ${eventTitle}` : `${items.length} bénévoles ont modifié leurs réponses — ${eventTitle}`
  const heading = one
    ? `${intro(items[0])} aux questions de ${eventTitle} :`
    : `${items.length} bénévoles ont modifié leurs réponses aux questions de ${eventTitle} :`
  const footer = "Les réponses à jour figurent dans la liste des inscriptions, la feuille de présence et la synthèse des réponses."

  const text = [
    heading,
    ``,
    ...(one
      ? items[0].changes.map((c) => `- ${changeLine(c)}`)
      : items.flatMap((i) => [`${i.volunteerName} :`, ...i.changes.map((c) => `- ${changeLine(c)}`), ``])),
    ...(one ? [``] : []),
    footer,
    ``,
    `Synthèse des réponses :`,
    url,
  ].join("\n")

  const list = (item: AnswerChangeItem) => `<ul style="color:#333;padding-left:1.25em;margin:0.25em 0 0.75em">${item.changes.map((c) => `<li style="margin:0.3em 0">${escapeHtml(changeLine(c))}</li>`).join("")}</ul>`
  const html = wrap(`
    <p>${one
      ? `<strong>${escapeHtml(items[0].volunteerName)}</strong> a modifié ${items[0].changes.length > 1 ? "ses réponses" : "sa réponse"} aux questions de <strong>${escapeHtml(eventTitle)}</strong> :`
      : `<strong>${items.length} bénévoles</strong> ont modifié leurs réponses aux questions de <strong>${escapeHtml(eventTitle)}</strong> :`}</p>
    ${one ? list(items[0]) : items.map((i) => `<p style="margin:0.75em 0 0"><strong>${escapeHtml(i.volunteerName)}</strong></p>${list(i)}`).join("")}
    <p style="color:#555">${escapeHtml(footer)}</p>
    <p style="margin-top:1.25em">${btn(url, "Synthèse des réponses")}</p>
  `, heading)

  return { subject, html, text }
}

/**
 * The same changes for a sector leader (#984, part 3): the questions attached to the poste they
 * lead, which the organisers route to them. Their personal link, as in a withdrawal email (#559):
 * they have no account. The volunteer is not necessarily on their poste, so the email itself
 * carries the answer; the link shows who is signed up on the poste.
 */
export function renderSectorLeaderAnswersChanged(p: NotificationPayload): RenderedEmail {
  const data = p.data as Record<string, unknown>
  const items = digestItems<AnswerChangeItem>(data).filter((i) => i?.changes?.length)
  const firstName = String(data.leaderName ?? "").split(" ")[0]
  const roleName = String(data.roleName)
  const eventTitle = String(data.eventTitle)
  const url = leaderPageUrl(data.orgSlug ? String(data.orgSlug) : undefined, String(data.token))
  const one = items.length === 1
  const subject = one ? `${items[0].changes.length > 1 ? "Réponses modifiées" : "Réponse modifiée"} — ${roleName}` : `${items.length} bénévoles ont modifié leurs réponses — ${roleName}`
  const what = `aux questions du poste « ${roleName} », dont vous êtes responsable pour ${eventTitle}`
  const heading = one ? `${intro(items[0])} ${what} :` : `${items.length} bénévoles ont modifié leurs réponses ${what} :`
  const footer = "L'organisation vous transmet ces modifications parce que ces questions concernent votre poste."

  const text = [
    `Bonjour ${firstName},`,
    ``,
    heading,
    ``,
    ...(one
      ? items[0].changes.map((c) => `- ${changeLine(c)}`)
      : items.flatMap((i) => [`${i.volunteerName} :`, ...i.changes.map((c) => `- ${changeLine(c)}`), ``])),
    ...(one ? [``] : []),
    footer,
    ``,
    `Les inscrits de votre poste :`,
    url,
  ].join("\n")

  const list = (item: AnswerChangeItem) => `<ul style="color:#333;padding-left:1.25em;margin:0.25em 0 0.75em">${item.changes.map((c) => `<li style="margin:0.3em 0">${escapeHtml(changeLine(c))}</li>`).join("")}</ul>`
  const whatHtml = `aux questions du poste <strong>${escapeHtml(roleName)}</strong>, dont vous êtes responsable pour <strong>${escapeHtml(eventTitle)}</strong>`
  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Bonjour ${escapeHtml(firstName)},</h2>
    <p>${one
      ? `<strong>${escapeHtml(items[0].volunteerName)}</strong> a modifié ${items[0].changes.length > 1 ? "ses réponses" : "sa réponse"} ${whatHtml} :`
      : `<strong>${items.length} bénévoles</strong> ont modifié leurs réponses ${whatHtml} :`}</p>
    ${one ? list(items[0]) : items.map((i) => `<p style="margin:0.75em 0 0"><strong>${escapeHtml(i.volunteerName)}</strong></p>${list(i)}`).join("")}
    <p style="color:#555">${escapeHtml(footer)}</p>
    <p style="margin-top:1.25em">${btn(url, "Voir les inscrits du poste")}</p>
  `, heading)

  return { subject, html, text }
}
