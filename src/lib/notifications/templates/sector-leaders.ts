// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sector leaders (#186): designation, new sign-up on their sector.
 */

import type { NotificationPayload } from "../types"
import { clockTime } from "../../gantt-utils"
import { leaderPageUrl, escapeHtml, btn, wrap, type RenderedEmail } from "./shared"

// ── Responsable de secteur (#186) ────────────────────────────────────────────

export function renderSectorLeaderInvite(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    leaderName: string
    roleName: string
    eventTitle: string
    orgSlug: string
    token: string
  }
  const firstName = d.leaderName.split(" ")[0]
  const leaderUrl = leaderPageUrl(d.orgSlug, d.token)
  const subject = `Vous êtes responsable de « ${d.roleName} » — ${d.eventTitle}`

  const text = [
    `Bonjour ${firstName},`,
    ``,
    `Vous avez été désigné·e responsable du poste « ${d.roleName} » pour ${d.eventTitle}.`,
    ``,
    `Ce lien personnel vous permet de consulter qui est inscrit sur ce poste (nom, email, téléphone) :`,
    leaderUrl,
    ``,
    `Conservez ce lien, il reste valable pour toute la durée de l'événement.`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Bonjour ${escapeHtml(firstName)},</h2>
    <p style="color:#555">Vous avez été désigné·e responsable du poste <strong>${escapeHtml(d.roleName)}</strong> pour <strong>${escapeHtml(d.eventTitle)}</strong>.</p>
    <p style="margin-top:1.25em">${btn(leaderUrl, "Voir qui est inscrit")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:1.5em">Ce lien reste valable pour toute la durée de l'événement.</p>
  `, `Consultez la liste des bénévoles inscrits sur « ${d.roleName} ».`)

  return { subject, html, text }
}

export function renderSectorLeaderNewSignup(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    leaderName: string
    roleName: string
    eventTitle: string
    volunteerName: string
    shiftLabel: string
    shiftDate: string
    startTime: string
    endTime: string
    orgSlug: string
    token: string
  }
  const firstName = d.leaderName.split(" ")[0]
  const leaderUrl = leaderPageUrl(d.orgSlug, d.token)
  const subject = `Nouvelle inscription — ${d.roleName}`

  const text = [
    `Bonjour ${firstName},`,
    ``,
    `${d.volunteerName} vient de s'inscrire sur « ${d.shiftLabel} » (${d.shiftDate} · ${clockTime(d.startTime)}–${clockTime(d.endTime)}), dont vous êtes responsable pour ${d.eventTitle}.`,
    ``,
    `Voir la liste complète :`,
    leaderUrl,
  ].join("\n")

  const html = wrap(`
    <p><strong>${escapeHtml(d.volunteerName)}</strong> vient de s'inscrire sur <strong>${escapeHtml(d.shiftLabel)}</strong> (${escapeHtml(d.shiftDate)} · ${escapeHtml(clockTime(d.startTime))}–${escapeHtml(clockTime(d.endTime))}), dont vous êtes responsable pour <strong>${escapeHtml(d.eventTitle)}</strong>.</p>
    <p style="margin-top:1.25em">${btn(leaderUrl, "Voir la liste complète")}</p>
  `, `${d.volunteerName} vient de s'inscrire sur ${d.roleName}.`)

  return { subject, html, text }
}

// ── Désistement d'un poste dont le destinataire est responsable (#559) ──────

export function renderSectorLeaderWithdrawal(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    leaderName: string
    roleName: string
    eventTitle: string
    volunteerName: string
    shiftLabel: string
    shiftDate: string
    startTime: string
    endTime: string
    placesMissing: number
    waitlistTookSpot: boolean
    message?: string | null
    orgSlug: string
    token: string
  }
  const firstName = d.leaderName.split(" ")[0]
  const leaderUrl = leaderPageUrl(d.orgSlug, d.token)
  const subject = `Désistement — ${d.roleName}`

  const spotLine = d.waitlistTookSpot
    ? "La place a été reprise automatiquement par la personne suivante sur la liste d'attente."
    : d.placesMissing > 0
      ? `Il manque maintenant ${d.placesMissing} place${d.placesMissing > 1 ? "s" : ""} sur ce créneau.`
      : "Ce créneau n'a pas de place manquante."

  const text = [
    `Bonjour ${firstName},`,
    ``,
    `${d.volunteerName} se désiste de « ${d.shiftLabel} » (${d.shiftDate} · ${clockTime(d.startTime)}–${clockTime(d.endTime)}), dont vous êtes responsable pour ${d.eventTitle}.`,
    ``,
    spotLine,
    ...(d.message ? [``, `Message laissé :`, `« ${d.message} »`] : []),
    ``,
    `Voir la liste complète :`,
    leaderUrl,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Bonjour ${escapeHtml(firstName)},</h2>
    <p style="color:#555"><strong>${escapeHtml(d.volunteerName)}</strong> se désiste de <strong>${escapeHtml(d.shiftLabel)}</strong> (${escapeHtml(d.shiftDate)} · ${escapeHtml(clockTime(d.startTime))}–${escapeHtml(clockTime(d.endTime))}), dont vous êtes responsable pour <strong>${escapeHtml(d.eventTitle)}</strong>.</p>
    <p style="color:#555">${escapeHtml(spotLine)}</p>
    ${d.message ? `<p style="color:#444;background:#f3f4f6;border-radius:8px;padding:10px 14px;white-space:pre-wrap">${escapeHtml(d.message)}</p>` : ""}
    <p style="margin-top:1.25em">${btn(leaderUrl, "Voir la liste complète")}</p>
  `, `${d.volunteerName} se désiste de ${d.roleName}.`)

  return { subject, html, text }
}
