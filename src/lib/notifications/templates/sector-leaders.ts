// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Sector leaders (#186): designation, new sign-up on their sector.
 *
 * A leader leads one poste or, since #1169, one sector (`scopeKind: "sector"`, `roleName` then
 * holds the sector's name). A poste leader's emails keep their wording of before #1169, in an event
 * with or without sectors (they already say « responsable du poste »). A sector leader's say « du
 * secteur », and a sign-up or withdrawal names the sector the poste belongs to (`sectorName`).
 */

/** « , un poste du secteur « Parking », » for a sector leader; nothing for a poste leader. */
function sectorClause(d: { sectorName?: string | null }): { text: string; html: string } {
  if (!d.sectorName) return { text: "", html: "" }
  return { text: `, un poste du secteur « ${d.sectorName} »,`, html: `, un poste du secteur <strong>${escapeHtml(d.sectorName)}</strong>,` }
}

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
    scopeKind?: "sector"
  }
  const firstName = d.leaderName.split(" ")[0]
  const leaderUrl = leaderPageUrl(d.orgSlug, d.token)
  const subject = `Vous êtes responsable de « ${d.roleName} » — ${d.eventTitle}`
  if (d.scopeKind === "sector") {
    const text = [
      `Bonjour ${firstName},`,
      ``,
      `Vous avez été désigné·e responsable du secteur « ${d.roleName} » pour ${d.eventTitle}.`,
      ``,
      `Ce lien personnel vous permet de consulter qui est inscrit sur les postes de ce secteur (nom, email, téléphone) :`,
      leaderUrl,
      ``,
      `Conservez ce lien, il reste valable pour toute la durée de l'événement.`,
    ].join("\n")
    const html = wrap(`
    <h2 style="margin:0 0 0.5em">Bonjour ${escapeHtml(firstName)},</h2>
    <p style="color:#555">Vous avez été désigné·e responsable du secteur <strong>${escapeHtml(d.roleName)}</strong> pour <strong>${escapeHtml(d.eventTitle)}</strong>.</p>
    <p style="margin-top:1.25em">${btn(leaderUrl, "Voir qui est inscrit")}</p>
    <p style="color:#666;font-size:0.85em;margin-top:1.5em">Ce lien reste valable pour toute la durée de l'événement.</p>
  `, `Consultez la liste des bénévoles inscrits sur les postes du secteur « ${d.roleName} ».`)
    return { subject, html, text }
  }

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
    <p style="color:#666;font-size:0.85em;margin-top:1.5em">Ce lien reste valable pour toute la durée de l'événement.</p>
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
    sectorName?: string | null
  }
  const firstName = d.leaderName.split(" ")[0]
  const leaderUrl = leaderPageUrl(d.orgSlug, d.token)
  const subject = `Nouvelle inscription — ${d.roleName}`
  const sector = sectorClause(d)

  const text = [
    `Bonjour ${firstName},`,
    ``,
    `${d.volunteerName} vient de s'inscrire sur « ${d.shiftLabel} » (${d.shiftDate} · ${clockTime(d.startTime)}–${clockTime(d.endTime)})${sector.text || ","} dont vous êtes responsable pour ${d.eventTitle}.`,
    ``,
    `Voir la liste complète :`,
    leaderUrl,
  ].join("\n")

  const html = wrap(`
    <p><strong>${escapeHtml(d.volunteerName)}</strong> vient de s'inscrire sur <strong>${escapeHtml(d.shiftLabel)}</strong> (${escapeHtml(d.shiftDate)} · ${escapeHtml(clockTime(d.startTime))}–${escapeHtml(clockTime(d.endTime))})${sector.html || ","} dont vous êtes responsable pour <strong>${escapeHtml(d.eventTitle)}</strong>.</p>
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
    /** Less than 24 hours before the start (#946): sent at once, with the start in words. */
    late?: boolean
    startsAt?: string
    sectorName?: string | null
  }
  const sector = sectorClause(d)
  const firstName = d.leaderName.split(" ")[0]
  const leaderUrl = leaderPageUrl(d.orgSlug, d.token)
  const subject = d.late ? `Désistement de dernière minute — ${d.roleName}` : `Désistement — ${d.roleName}`
  const lateLine = d.late ? `Désistement de dernière minute : le créneau commence ${d.startsAt ? `le ${d.startsAt}` : "dans moins de 24 heures"}.` : null
  // A place left empty with nobody waiting: the organisers have the « Trouver un remplaçant » page;
  // the leader, who has no admin access, is told they are on it and who to tell of a replacement.
  const replaceLine = d.late && !d.waitlistTookSpot && d.placesMissing > 0
    ? "Pour remplacer cette personne : l'organisation est prévenue en même temps. Si vous connaissez quelqu'un de disponible, voyez avec elle."
    : null

  const spotLine = d.waitlistTookSpot
    ? "La place a été reprise automatiquement par la personne suivante sur la liste d'attente."
    : d.placesMissing > 0
      ? `Il manque maintenant ${d.placesMissing} place${d.placesMissing > 1 ? "s" : ""} sur ce créneau.`
      : "Ce créneau n'a pas de place manquante."

  const text = [
    `Bonjour ${firstName},`,
    ``,
    ...(lateLine ? [lateLine, ``] : []),
    `${d.volunteerName} se désiste de « ${d.shiftLabel} » (${d.shiftDate} · ${clockTime(d.startTime)}–${clockTime(d.endTime)})${sector.text || ","} dont vous êtes responsable pour ${d.eventTitle}.`,
    ``,
    spotLine,
    ...(replaceLine ? [``, replaceLine] : []),
    ...(d.message ? [``, `Message laissé :`, `« ${d.message} »`] : []),
    ``,
    `Voir la liste complète :`,
    leaderUrl,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Bonjour ${escapeHtml(firstName)},</h2>${lateLine ? `
    <p style="color:#991b1b;font-weight:600">${escapeHtml(lateLine)}</p>` : ""}
    <p style="color:#555"><strong>${escapeHtml(d.volunteerName)}</strong> se désiste de <strong>${escapeHtml(d.shiftLabel)}</strong> (${escapeHtml(d.shiftDate)} · ${escapeHtml(clockTime(d.startTime))}–${escapeHtml(clockTime(d.endTime))})${sector.html || ","} dont vous êtes responsable pour <strong>${escapeHtml(d.eventTitle)}</strong>.</p>
    <p style="color:#555">${escapeHtml(spotLine)}</p>${replaceLine ? `
    <p style="color:#555">${escapeHtml(replaceLine)}</p>` : ""}
    ${d.message ? `<p style="color:#444;background:#f3f4f6;border-radius:8px;padding:10px 14px;white-space:pre-wrap">${escapeHtml(d.message)}</p>` : ""}
    <p style="margin-top:1.25em">${btn(leaderUrl, "Voir la liste complète")}</p>
  `, d.late ? `Dernière minute : ${d.volunteerName} se désiste de ${d.roleName}.` : `${d.volunteerName} se désiste de ${d.roleName}.`)

  return { subject, html, text }
}
