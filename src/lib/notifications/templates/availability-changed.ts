// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { NotificationPayload } from "../types"
import { digestItems } from "../digest-items"
import { BASE_URL, btn, escapeHtml, wrap, type RenderedEmail } from "./shared"

/**
 * A person with a published mission corrected their availability (#1146, lot C; owner decision of
 * 2026-10-30): one email per event and organiser, grouped over 10 minutes. Each person once, with the
 * missions that ended up outside their new answer, if any (the stronger wording). Never the ranges:
 * the organisers read them on the event's page. Nobody was moved or cancelled.
 */
export type AvailabilityChangeItem = { volunteerName: string; outside: string[] }

export const availabilityAdminUrl = (eventId: string) => `${BASE_URL}/admin/events/${eventId}/availability/drafts`

const line = (i: AvailabilityChangeItem) =>
  i.outside.length > 0
    ? `${i.volunteerName} a corrigé ses disponibilités. ${i.outside.length > 1 ? "Missions désormais" : "Mission désormais"} hors de ses disponibilités : ${i.outside.join(" ; ")}.`
    : `${i.volunteerName} a corrigé ses disponibilités ; ses missions restent dans ses disponibilités.`

export function renderAvailabilityChanged(p: NotificationPayload): RenderedEmail {
  const data = p.data as Record<string, unknown>
  const items = digestItems<AvailabilityChangeItem>(data).filter((i) => i?.volunteerName)
  const eventTitle = String(data.eventTitle)
  const url = availabilityAdminUrl(String(data.eventId))
  const outside = items.some((i) => i.outside.length > 0)
  const one = items.length === 1
  const subject = outside
    ? `${one ? "Mission hors disponibilités" : "Missions hors disponibilités"} — ${eventTitle}`
    : `${one ? "Disponibilités corrigées" : `${items.length} bénévoles ont corrigé leurs disponibilités`} — ${eventTitle}`
  const heading = `Après la publication des affectations de ${eventTitle} :`
  const footer = "Personne n'a été déplacé ni désinscrit. Vérifiez les affectations concernées et contactez les personnes si besoin."
  const text = [heading, "", ...items.map((i) => `- ${line(i)}`), "", footer, "", "Affectations de l'événement :", url].join("\n")
  const html = wrap(`
    <p>${escapeHtml(heading)}</p>
    <ul style="color:#333;padding-left:1.25em;margin:0.25em 0 0.75em">${items.map((i) => `<li style="margin:0.3em 0">${i.outside.length > 0 ? "<strong>" : ""}${escapeHtml(line(i))}${i.outside.length > 0 ? "</strong>" : ""}</li>`).join("")}</ul>
    <p style="color:#555">${escapeHtml(footer)}</p>
    <p style="margin-top:1.25em">${btn(url, "Voir les affectations")}</p>
  `, subject)
  return { subject, html, text }
}
