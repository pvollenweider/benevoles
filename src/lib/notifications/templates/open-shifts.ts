// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Chercher des bénévoles » (#566): the open shifts an organizer proposes to a member they picked,
 * with the places left and the link to sign up. One email per person.
 */

import type { NotificationPayload } from "../types"
import { openShiftLine, OPEN_SHIFTS_SUBJECT, type OpenShift } from "../../open-shifts"
import { myPageUrl, escapeHtml, btn, wrap, type RenderedEmail } from "./shared"

export type OpenShiftsEmailData = {
  volunteerName: string
  organizationName: string
  eventTitle: string
  /** The organizer's optional words, plain text. */
  note?: string | null
  /** The selected open shifts offered to this person, in time order. */
  shifts: OpenShift[]
  /** Their invitation link, or the event page. */
  signupUrl: string
  /** With an invitation link only (#558): « pas disponible » in one click, confirmed on the page. */
  declineUrl?: string
  /** Members already registered without an invitation: their personal page too. */
  editToken?: string
  orgSlug?: string
}

/** The sign-up link with one shift proposed (#869): the page offers it in one click (`?creneau=`). */
export function takeShiftUrl(signupUrl: string, shiftId: string): string {
  try {
    const url = new URL(signupUrl)
    url.searchParams.set("creneau", shiftId)
    return url.toString()
  } catch {
    return `${signupUrl}${signupUrl.includes("?") ? "&" : "?"}creneau=${encodeURIComponent(shiftId)}`
  }
}

/** « Bar, 4 juillet »: tells the « Je prends ce créneau » links apart when several are listed. */
function takeLabel(s: OpenShift): string {
  const day = new Date(`${String(s.date).slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-CH", { day: "numeric", month: "long", timeZone: "UTC" })
  return `${s.label !== s.roleName ? `${s.roleName}, ${s.label}` : s.roleName}, ${day}`
}

export function renderOpenShifts(p: NotificationPayload): RenderedEmail {
  const d = p.data as OpenShiftsEmailData
  const firstName = d.volunteerName.split(" ")[0]
  const subject = `${d.eventTitle} : ${OPEN_SHIFTS_SUBJECT.charAt(0).toLowerCase()}${OPEN_SHIFTS_SUBJECT.slice(1)}`
  const editUrl = d.editToken ? myPageUrl(d.orgSlug, d.editToken) : null
  const lines = d.shifts.map(openShiftLine)
  const several = d.shifts.length > 1
  const intro = several
    ? `Il reste des places sur quelques créneaux de ${d.eventTitle}, et ${d.organizationName} a pensé à toi. Si l'un d'eux te convient, inscris-toi avec le lien ci-dessous.`
    : `Il reste des places sur un créneau de ${d.eventTitle}, et ${d.organizationName} a pensé à toi. S'il te convient, inscris-toi avec le lien ci-dessous.`
  const note = d.note?.trim()

  const text = [
    `Hello ${firstName} !`,
    ``,
    intro,
    ...(note ? [``, note] : []),
    ``,
    several ? `Les créneaux à compléter :` : `Le créneau à compléter :`,
    ...d.shifts.flatMap((s, i) => [`- ${lines[i]}`, `  Je prends ce créneau : ${takeShiftUrl(d.signupUrl, s.id)}`]),
    ``,
    several ? `Tous les créneaux : ${d.signupUrl}` : `T'inscrire : ${d.signupUrl}`,
    ...(editUrl ? [`Tes inscriptions : ${editUrl}`] : []),
    ...(d.declineUrl ? [``, `Pas disponible cette fois ? Tu peux le dire ici : ${d.declineUrl}`] : []),
    ``,
    `Merci d'avance !`,
    d.organizationName,
  ].join("\n")

  const html = wrap(`
    <h1 style="margin:0 0 0.25em;font-size:1.5em">Hello ${escapeHtml(firstName)} !</h1>
    <p style="margin:0 0 1em;color:#333">${escapeHtml(intro)}</p>
    ${note ? `<div style="background:#f3f4f6;padding:14px;border-radius:10px;white-space:pre-wrap;margin-bottom:1em">${escapeHtml(note)}</div>` : ""}
    <p style="color:#555;margin-bottom:0.5em">${several ? "Les créneaux à compléter :" : "Le créneau à compléter :"}</p>
    <ul style="background:#f9fafb;border-radius:10px;padding:12px 16px 12px 32px;margin:0">
      ${d.shifts.map((s, i) => `<li style="padding:4px 0">${escapeHtml(lines[i])}<br><a href="${escapeHtml(takeShiftUrl(d.signupUrl, s.id))}" style="color:#1d4ed8;font-weight:600">Je prends ce créneau${several ? ` (${escapeHtml(takeLabel(s))})` : ""}</a></li>`).join("")}
    </ul>
    <p style="margin-top:1.5em">${btn(d.signupUrl, several ? "Voir tous les créneaux" : "Choisir mon créneau")}</p>
    ${editUrl ? `<p style="font-size:0.9em"><a href="${escapeHtml(editUrl)}" style="color:#2563eb">Voir mes inscriptions</a></p>` : ""}
    <p style="color:#666;font-size:0.85em;margin-top:2em">Merci d'avance !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
    ${d.declineUrl ? `<p style="color:#666;font-size:0.8em">Pas disponible cette fois ? <a href="${escapeHtml(d.declineUrl)}" style="color:#2563eb">Indiquer que je ne suis pas disponible</a>.</p>` : ""}
  `, lines[0])

  return { subject, html, text }
}
