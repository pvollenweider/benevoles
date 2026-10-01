// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Invitations: a member invited to an event, an admin invited to an organization.
 */

import type { NotificationPayload } from "../types"
import { eventPublicUrl } from "@/lib/urls"
import { escapeHtml, btn, wrap, type RenderedEmail } from "./shared"

// ── Invitation d'un membre ───────────────────────────────────────────────────

export function renderMemberInvite(p: NotificationPayload): RenderedEmail {
  const {
    memberName,
    organizationName,
    eventTitle,
    eventDate,
    eventLocation,
    orgSlug,
    eventSlug,
    message,
    token,
  } = p.data as {
    memberName: string
    organizationName: string
    eventTitle: string
    eventDate: string
    eventLocation: string | null
    orgSlug: string
    eventSlug: string
    message: string | null
    token: string
  }
  const inviteUrl = `${eventPublicUrl(orgSlug, eventSlug)}?token=${token}`
  const firstName = memberName.split(" ")[0]
  const subject = `[${organizationName}] On a besoin de toi — ${eventTitle} 🙌`

  const text = [
    `Hello ${firstName} !`,
    ``,
    `On a besoin de bénévoles géniaux comme toi pour ${eventTitle} !`,
    message ? `\n${message}\n` : ``,
    `📅 ${eventDate}`,
    eventLocation ? `📍 ${eventLocation}` : ``,
    ``,
    `Consulte les missions disponibles et inscris-toi ici :`,
    inviteUrl,
    ``,
    `Un grand merci d'avance, une grosse bise et à très vite !`,
    `L'équipe ${organizationName}`,
  ].filter(Boolean).join("\n")

  const preheader = `${organizationName} t'invite à rejoindre l'équipe bénévole — inscris-toi en un clic.`
  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! 👋</h2>
    <p style="margin:0 0 1em;color:#555">On a besoin de bénévoles géniaux comme toi pour <strong>${escapeHtml(eventTitle)}</strong> !</p>
    ${message ? `<div style="background:#f3f4f6;padding:14px;border-radius:10px;white-space:pre-wrap;margin-bottom:1em">${escapeHtml(message)}</div>` : ""}
    <p style="color:#555">📅 ${escapeHtml(eventDate)}${eventLocation ? `<br>📍 ${escapeHtml(eventLocation)}` : ""}</p>
    <p style="margin-top:1.5em">${btn(inviteUrl, "Voir les missions et m'inscrire")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">Un grand merci d'avance, une grosse bise et à très vite !<br><strong>${escapeHtml(organizationName)}</strong></p>
    <p style="color:#bbb;font-size:0.8em">Si tu ne peux pas participer, ignore cet email.</p>
  `, preheader)

  return { subject, html, text }
}

// ── Invitation d'un admin ────────────────────────────────────────────────────

export function renderAdminInvite(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    adminName: string
    organizationName: string
    inviteUrl: string
  }
  const subject = `Invitation à rejoindre ${d.organizationName} sur Bénévoles`

  const text = [
    `Bonjour ${d.adminName},`,
    ``,
    `Nous vous invitons à rejoindre ${d.organizationName} en tant qu'administratrice ou administrateur sur Bénévoles.`,
    ``,
    `Créez votre compte en cliquant sur ce lien (valable 7 jours) :`,
    d.inviteUrl,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Bonjour ${escapeHtml(d.adminName)},</h2>
    <p>Nous vous invitons à rejoindre <strong>${escapeHtml(d.organizationName)}</strong> en tant qu'administratrice ou administrateur sur Bénévoles.</p>
    <p style="margin-top:1.5em">${btn(d.inviteUrl, "Créer mon compte")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">Ce lien est valable 7 jours. Si vous n'attendiez pas cette invitation, ignorez cet email.</p>
  `, `Créez votre compte en un clic — lien valable 7 jours.`)

  return { subject, html, text }
}
