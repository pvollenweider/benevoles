// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Dated availability (#1146): the request sent to a member, with their own link « Indiquer mes
 * disponibilités ». The link opens a page; nothing is ever answered by following it.
 */

import type { NotificationPayload } from "../types"
import { availabilityPageUrl, escapeHtml, btn, wrap, type RenderedEmail } from "./shared"
import { AVAILABILITY_LINK_LABEL } from "@/lib/event-availability-text"

export type AvailabilityRequestData = {
  firstName: string
  organizationName: string
  eventTitle: string
  /** « du vendredi 10 au dimanche 12 juillet », or « le samedi 4 juillet ». */
  datesLabel: string
  /** « dimanche 28 juin à 23h59 », or null without a deadline. */
  deadlineLabel: string | null
  orgSlug: string
  token: string
  /** A reminder to someone who has not answered yet. */
  reminder?: boolean
}

export function renderAvailabilityRequest(p: NotificationPayload): RenderedEmail {
  const d = p.data as AvailabilityRequestData
  const url = availabilityPageUrl(d.orgSlug, d.token)
  const subject = d.reminder ? `[${d.organizationName}] Rappel : tes disponibilités pour ${d.eventTitle}` : `[${d.organizationName}] Tes disponibilités pour ${d.eventTitle}`
  const lead = d.reminder
    ? `Petit rappel : nous n'avons pas encore tes disponibilités pour ${d.eventTitle}, ${d.datesLabel}.`
    : `Pour préparer ${d.eventTitle}, ${d.datesLabel}, ${d.organizationName} aimerait savoir quand tu es libre.`
  const how = "Pour chaque date, indique les heures où tu es libre (un horaire du soir peut finir le lendemain matin) ou « pas disponible ». Pas besoin de compte : le lien suffit."
  const deadline = d.deadlineLabel ? `Merci de répondre avant le ${d.deadlineLabel}. Tu peux changer tes réponses jusque-là.` : "Tu peux changer tes réponses à tout moment."
  const notice = "Ce lien est personnel : ne le transmets pas. Seule l'organisation voit tes réponses."
  const text = [
    `Bonjour ${d.firstName},`,
    ``,
    lead,
    how,
    deadline,
    ``,
    `${AVAILABILITY_LINK_LABEL} :`,
    url,
    ``,
    notice,
    ``,
    `Merci !`,
    d.organizationName,
  ].join("\n")
  const html = wrap(`
    <p style="margin:0 0 0.75em">Bonjour ${escapeHtml(d.firstName)},</p>
    <p style="margin:0 0 0.75em">${escapeHtml(lead)}</p>
    <p style="margin:0 0 0.75em">${escapeHtml(how)}</p>
    <p style="margin:0 0 0.75em">${escapeHtml(deadline)}</p>
    <p style="margin-top:1.25em">${btn(url, AVAILABILITY_LINK_LABEL)}</p>
    <p style="color:#555;font-size:0.85em;margin-top:1.25em">${escapeHtml(notice)}</p>
    <p style="margin-top:1.25em">Merci !<br>${escapeHtml(d.organizationName)}</p>
  `, lead)
  return { subject, text, html }
}
