// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Emails to organizers and admins: new registration, welcome, password reset, product updates.
 */

import type { NotificationPayload } from "../types"
import { renderMarkdown } from "@/lib/markdown"
import { clockTime } from "../../gantt-utils"
import { escapeHtml, btn, wrap, adminShiftUrl, adminStaffingUrl, type RenderedEmail } from "./shared"

// ── Notif admin (interne) ────────────────────────────────────────────────────

export function renderAdminNotification(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    eventTitle: string
    volunteerName: string
    volunteerEmail: string
    shifts: { label: string; roleName: string; date: string; startTime: string; endTime: string }[]
  }
  const subject = `Nouvelle inscription — ${d.eventTitle}`

  const shiftLines = d.shifts.map((s) => {
    const name = s.label && s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName
    return `  • ${name} · ${s.date} · ${clockTime(s.startTime)}–${clockTime(s.endTime)}`
  })

  const text = [
    `${d.volunteerName} (${d.volunteerEmail}) vient de s'inscrire à ${d.eventTitle}.`,
    ``,
    ...shiftLines,
  ].join("\n")

  const html = wrap(`
    <p><strong>${escapeHtml(d.volunteerName)}</strong> (${escapeHtml(d.volunteerEmail)}) vient de s'inscrire à <strong>${escapeHtml(d.eventTitle)}</strong>.</p>
    <ul style="padding-left:1.2em;line-height:1.8">
      ${d.shifts.map((s) => {
        const name = s.label && s.label !== s.roleName
          ? `${escapeHtml(s.roleName)} · ${escapeHtml(s.label)}`
          : escapeHtml(s.roleName)
        return `<li><strong>${name}</strong> · ${escapeHtml(s.date)} · ${escapeHtml(clockTime(s.startTime))}–${escapeHtml(clockTime(s.endTime))}</li>`
      }).join("")}
    </ul>
  `, `${d.volunteerName} · ${d.shifts.length} créneau${d.shifts.length > 1 ? "x" : ""}`)

  return { subject, html, text }
}

// ── Désistement (#559) : admins de l'organisation, place confirmée ou demande ─
//
// Reprend le kind `registration_cancelled`, qui existait sans jamais être envoyé : son contenu
// d'origine (confirmation de désinscription au bénévole lui-même) ne correspond pas à ce dont
// cette notification a besoin (l'équipe prévenue d'un désistement), donc remplacé plutôt que
// doublé avec un nouveau kind.
export function renderWithdrawalAdminNotice(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    eventId: string
    eventTitle: string
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
  const shiftName = d.shiftLabel && d.shiftLabel !== d.roleName ? `${d.roleName} · ${d.shiftLabel}` : d.roleName
  const subject = `Désistement — ${d.eventTitle}`
  const shiftUrl = adminShiftUrl(d.eventId, d.shiftId)
  const staffingUrl = adminStaffingUrl(d.eventId)

  const spotLine = d.waitlistTookSpot
    ? "La place a été reprise automatiquement par la personne suivante sur la liste d'attente."
    : d.placesMissing > 0
      ? `Il manque maintenant ${d.placesMissing} place${d.placesMissing > 1 ? "s" : ""} sur ce créneau.`
      : "Ce créneau n'a pas de place manquante."

  const text = [
    `${d.volunteerName} se désiste de ${shiftName} (${d.shiftDate} · ${clockTime(d.startTime)}–${clockTime(d.endTime)}) pour ${d.eventTitle}.`,
    ``,
    spotLine,
    ...(d.message ? [``, `Message laissé :`, `« ${d.message} »`] : []),
    ``,
    `Voir l'inscription :`,
    shiftUrl,
    ``,
    `Suivi des effectifs :`,
    staffingUrl,
  ].join("\n")

  const html = wrap(`
    <p><strong>${escapeHtml(d.volunteerName)}</strong> se désiste de <strong>${escapeHtml(shiftName)}</strong> (${escapeHtml(d.shiftDate)} · ${escapeHtml(clockTime(d.startTime))}–${escapeHtml(clockTime(d.endTime))}) pour <strong>${escapeHtml(d.eventTitle)}</strong>.</p>
    <p style="color:#555">${escapeHtml(spotLine)}</p>
    ${d.message ? `<p style="color:#444;background:#f3f4f6;border-radius:8px;padding:10px 14px;white-space:pre-wrap">${escapeHtml(d.message)}</p>` : ""}
    <p style="margin-top:1.25em">${btn(shiftUrl, "Voir l'inscription")}</p>
    <p style="margin-top:0.75em"><a href="${staffingUrl}" style="color:#2563eb">Suivi des effectifs</a></p>
  `, `${d.volunteerName} se désiste de ${shiftName}.`)

  return { subject, html, text }
}

// ── Réinitialisation mot de passe ────────────────────────────────────────────

export function renderPasswordReset(p: NotificationPayload): RenderedEmail {
  const d = p.data as { adminName: string; resetUrl: string }
  const subject = `Réinitialisation de votre mot de passe`

  const text = [
    `Bonjour ${d.adminName},`,
    ``,
    `Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le lien ci-dessous (valable 1 heure) :`,
    d.resetUrl,
    ``,
    `Si vous n'avez pas fait cette demande, ignorez cet email — votre mot de passe reste inchangé.`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Réinitialisation de mot de passe</h2>
    <p>Bonjour ${escapeHtml(d.adminName)},</p>
    <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
    <p style="margin-top:1.5em">${btn(d.resetUrl, "Réinitialiser mon mot de passe")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">Ce lien est valable 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.</p>
  `, `Cliquez dans l'heure qui suit — si ce n'est pas vous, ignorez cet email.`)

  return { subject, html, text }
}

// ── Bienvenue après activation du compte admin ───────────────────────────────

export function renderAdminWelcome(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    adminName: string
    organizationName: string
    adminUrl: string
  }
  const subject = `Bienvenue sur Bénévoles — ${d.organizationName}`

  const text = [
    `Bonjour ${d.adminName},`,
    ``,
    `Votre compte administrateur pour ${d.organizationName} est maintenant actif.`,
    ``,
    `Gérez vos événements et bénévoles ici :`,
    d.adminUrl,
    ``,
    `Bonne organisation !`,
    `L'équipe Bénévoles`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Bienvenue, ${escapeHtml(d.adminName)} !</h2>
    <p>Votre compte administrateur pour <strong>${escapeHtml(d.organizationName)}</strong> est maintenant actif.</p>
    <p style="margin-top:1.5em">${btn(d.adminUrl, "Accéder à mon espace admin")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">Vous pouvez utiliser ce lien à tout moment pour gérer vos événements et vos bénévoles.</p>
  `, `Votre espace admin est prêt — gérez vos événements et bénévoles dès maintenant.`)

  return { subject, html, text }
}

// ── Nouveautés produit (#200) ─────────────────────────────────────────────────

export function renderProductUpdate(p: NotificationPayload): RenderedEmail {
  const { subject, content, unsubscribeUrl } = p.data as {
    subject: string
    content: string
    unsubscribeUrl: string
  }

  const text = [
    content,
    ``,
    `Vous recevez cet email en tant qu'administrateur benevol.app.`,
    `Se désabonner de ces communications : ${unsubscribeUrl}`,
  ].join("\n")

  const html = wrap(`
    <div style="line-height:1.6">${renderMarkdown(content)}</div>
    <p style="color:#aaaaaa;font-size:0.8em;margin-top:2em;padding-top:1em;border-top:1px solid #f0f0f0">
      Vous recevez cet email en tant qu'administrateur benevol.app.
      <a href="${unsubscribeUrl}" style="color:#aaaaaa">Se désabonner</a> de ces communications.
    </p>
  `, subject)

  return { subject, html, text }
}

// ── Résumé quotidien des adresses à vérifier (#599), propriétaires et admins de l'organisation ──

export function renderAddressesToVerifySummary(p: NotificationPayload): RenderedEmail {
  const d = p.data as { count: number; members: { name: string }[]; membersUrl: string }
  const plural = d.count > 1
  const subject = `${d.count} adresse${plural ? "s" : ""} à vérifier`
  const intro = `${d.count} membre${plural ? "s ont" : " a"} un message important (confirmation, proposition de liste d'attente ou rappel) qui n'est pas arrivé dans les dernières 24 heures : le serveur destinataire a refusé l'adresse de façon définitive.`

  const text = [
    intro,
    ``,
    ...d.members.map((m) => `  • ${m.name}`),
    ``,
    `Voir les adresses à vérifier :`,
    d.membersUrl,
  ].join("\n")

  const html = wrap(`
    <p>${escapeHtml(intro)}</p>
    <ul style="padding-left:1.2em;line-height:1.8">
      ${d.members.map((m) => `<li>${escapeHtml(m.name)}</li>`).join("")}
    </ul>
    <p style="margin-top:1.25em">${btn(d.membersUrl, "Voir les adresses à vérifier")}</p>
  `, `${d.count} adresse${plural ? "s" : ""} à vérifier.`)

  return { subject, html, text }
}

// ── Nouvelle version disponible (#612), instances auto-hébergées, super admin ────────────────

export function renderReleaseAvailable(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    version: string
    currentVersion: string
    releaseUrl: string
    upgradeDocsUrl: string
  }
  const subject = `Nouvelle version disponible : ${d.version}`

  const text = [
    `Une nouvelle version de Bénévoles est disponible : ${d.version} (vous utilisez ${d.currentVersion}).`,
    ``,
    `Notes de version :`,
    d.releaseUrl,
    ``,
    `Documentation de mise à jour :`,
    d.upgradeDocsUrl,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Nouvelle version disponible</h2>
    <p>Une nouvelle version de Bénévoles est disponible : <strong>${escapeHtml(d.version)}</strong> (vous utilisez ${escapeHtml(d.currentVersion)}).</p>
    <p style="margin-top:1.5em">${btn(d.releaseUrl, "Voir les notes de version")}</p>
    <p style="margin-top:0.75em"><a href="${d.upgradeDocsUrl}" style="color:#2563eb">Documentation de mise à jour</a></p>
  `, `${d.version} est disponible, vous utilisez ${d.currentVersion}.`)

  return { subject, html, text }
}
