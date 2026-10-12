// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { NotificationPayload } from "../types"
import { clockTime } from "../../gantt-utils"
import { digestItems } from "../digest-items"
import { renderWithdrawalAdminNotice } from "./administration"
import { renderSectorLeaderWithdrawal } from "./sector-leaders"
import { escapeHtml, btn, wrap, adminFindReplacementUrl, adminRecentCancellationsUrl, adminStaffingUrl, leaderPageUrl, type RenderedEmail } from "./shared"

/**
 * Withdrawal emails grouped per event and recipient (#869): one withdrawal reads as before; several
 * are listed in one email, each with its shift, what is missing and its message, and a
 * « Trouver un remplaçant » link for each shift left with an empty place and nobody waiting.
 */
type Withdrawal = {
  volunteerName: string
  shiftId: string
  shiftLabel: string
  roleName: string
  shiftDate: string
  startTime: string
  endTime: string
  placesMissing: number
  waitlistTookSpot: boolean
  message?: string | null
}

const shiftName = (w: Withdrawal) => (w.shiftLabel && w.shiftLabel !== w.roleName ? `${w.roleName} · ${w.shiftLabel}` : w.roleName)
const when = (w: Withdrawal) => `${w.shiftDate} · ${clockTime(w.startTime)}–${clockTime(w.endTime)}`
const spot = (w: Withdrawal) =>
  w.waitlistTookSpot
    ? "place reprise par la liste d'attente"
    : w.placesMissing > 0
      ? `il manque ${w.placesMissing} place${w.placesMissing > 1 ? "s" : ""}`
      : "pas de place manquante"

/** The items with only the latest state per shift for the « missing » count: the email reads oldest first. */
function itemsOf(p: NotificationPayload): { base: Record<string, unknown>; items: Withdrawal[] } {
  const data = p.data as Record<string, unknown>
  return { base: data, items: digestItems<Withdrawal>(data) }
}

export function renderWithdrawalAdminDigest(p: NotificationPayload): RenderedEmail {
  const { base, items } = itemsOf(p)
  if (items.length <= 1) return renderWithdrawalAdminNotice({ ...p, data: { ...base, ...items[0] } })
  const eventId = String(base.eventId)
  const eventTitle = String(base.eventTitle)
  // One link per shift still missing someone, after the latest withdrawal on it.
  const latest = new Map(items.map((w) => [w.shiftId, w]))
  const toFill = [...latest.values()].filter((w) => !w.waitlistTookSpot && w.placesMissing > 0)
  const subject = `${items.length} désistements — ${eventTitle}`

  const text = [
    `${items.length} désistements pour ${eventTitle} :`,
    ``,
    ...items.flatMap((w) => [`- ${w.volunteerName}, ${shiftName(w)} (${when(w)}) : ${spot(w)}`, ...(w.message ? [`  Message : « ${w.message} »`] : [])]),
    ...(toFill.length > 0 ? [``, `Trouver un remplaçant :`, ...toFill.map((w) => `- ${shiftName(w)} (${when(w)}) : ${adminFindReplacementUrl(eventId, w.shiftId)}`)] : []),
    ``,
    `Suivi des effectifs :`,
    adminStaffingUrl(eventId),
    ``,
    `Une erreur ? Tant que la place est libre et que le créneau n'a pas commencé, vous pouvez rétablir une inscription :`,
    adminRecentCancellationsUrl(eventId),
  ].join("\n")

  const html = wrap(`
    <p><strong>${items.length} désistements</strong> pour <strong>${escapeHtml(eventTitle)}</strong> :</p>
    <ul style="color:#333;padding-left:1.25em">
      ${items.map((w) => `<li style="margin:0.4em 0"><strong>${escapeHtml(w.volunteerName)}</strong>, ${escapeHtml(shiftName(w))} (${escapeHtml(when(w))}) : ${escapeHtml(spot(w))}${w.message ? `<br><span style="color:#444;white-space:pre-wrap">« ${escapeHtml(w.message)} »</span>` : ""}</li>`).join("")}
    </ul>
    ${toFill.length > 0 ? `<p style="color:#555;margin-top:1.25em">Trouver un remplaçant, avec les membres libres à cet horaire :</p><ul style="padding-left:1.25em">${toFill.map((w) => `<li style="margin:0.4em 0"><a href="${adminFindReplacementUrl(eventId, w.shiftId)}" style="color:#1d4ed8;font-weight:600">${escapeHtml(shiftName(w))} (${escapeHtml(when(w))})</a></li>`).join("")}</ul>` : ""}
    <p style="margin-top:1.25em">${btn(adminStaffingUrl(eventId), "Suivi des effectifs")}</p>
    <p style="color:#555;margin-top:1.5em">Une erreur ? Tant que la place est libre et que le créneau n'a pas commencé, vous pouvez <a href="${adminRecentCancellationsUrl(eventId)}" style="color:#1d4ed8;text-decoration:underline">rétablir une inscription</a>.</p>
  `, `${items.length} désistements pour ${eventTitle}.`)

  return { subject, html, text }
}

export function renderSectorLeaderWithdrawalDigest(p: NotificationPayload): RenderedEmail {
  const { base, items } = itemsOf(p)
  if (items.length <= 1) return renderSectorLeaderWithdrawal({ ...p, data: { ...base, ...items[0] } })
  const firstName = String(base.leaderName ?? "").split(" ")[0]
  const eventTitle = String(base.eventTitle)
  const leaderUrl = leaderPageUrl(String(base.orgSlug), String(base.token))
  const subject = `${items.length} désistements — ${eventTitle}`

  const text = [
    `Bonjour ${firstName},`,
    ``,
    `${items.length} désistements sur les créneaux dont vous êtes responsable pour ${eventTitle} :`,
    ``,
    ...items.flatMap((w) => [`- ${w.volunteerName}, « ${w.shiftLabel} » (${when(w)}) : ${spot(w)}`, ...(w.message ? [`  Message : « ${w.message} »`] : [])]),
    ``,
    `Voir la liste complète :`,
    leaderUrl,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Bonjour ${escapeHtml(firstName)},</h2>
    <p style="color:#555"><strong>${items.length} désistements</strong> sur les créneaux dont vous êtes responsable pour <strong>${escapeHtml(eventTitle)}</strong> :</p>
    <ul style="color:#333;padding-left:1.25em">
      ${items.map((w) => `<li style="margin:0.4em 0"><strong>${escapeHtml(w.volunteerName)}</strong>, « ${escapeHtml(w.shiftLabel)} » (${escapeHtml(when(w))}) : ${escapeHtml(spot(w))}${w.message ? `<br><span style="color:#444;white-space:pre-wrap">« ${escapeHtml(w.message)} »</span>` : ""}</li>`).join("")}
    </ul>
    <p style="margin-top:1.25em">${btn(leaderUrl, "Voir la liste complète")}</p>
  `, `${items.length} désistements pour ${eventTitle}.`)

  return { subject, html, text }
}
