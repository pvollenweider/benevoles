/**
 * Templates for every notification kind. Plain-text + HTML.
 */

import type { NotificationPayload } from "./types"
import { eventPublicUrl, orgBaseUrl } from "@/lib/urls"

const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

function myPageUrl(orgSlug: string | undefined, editToken: string): string {
  const base = orgSlug ? orgBaseUrl(orgSlug) : BASE_URL
  return `${base}/my/${editToken}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">${label}</a>`
}

function wrap(inner: string): string {
  return `<div style="font-family:-apple-system,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111;line-height:1.5">${inner}</div>`
}

export type RenderedEmail = {
  subject: string
  html: string
  text: string
}

export function render(payload: NotificationPayload): RenderedEmail {
  switch (payload.kind) {
    case "registration_confirmation":
      return renderConfirmation(payload)
    case "member_invite":
      return renderMemberInvite(payload)
    case "reminder_j2":
      return renderReminderJ2(payload)
    case "reminder_j1":
      return renderReminderJ1(payload)
    case "reminder_dd":
      return renderReminderDd(payload)
    case "manual_reminder":
      return renderManualReminder(payload)
    case "shift_modified":
      return renderShiftModified(payload)
    case "shift_cancelled":
      return renderShiftCancelled(payload)
    case "registration_cancelled":
      return renderRegistrationCancelled(payload)
    case "admin_notification":
      return renderAdminNotification(payload)
    case "admin_invite":
      return renderAdminInvite(payload)
    case "admin_welcome":
      return renderAdminWelcome(payload)
    case "password_reset":
      return renderPasswordReset(payload)
  }
}

// ── Inscription confirmée ────────────────────────────────────────────────────

function renderConfirmation(p: NotificationPayload): RenderedEmail {
  const { volunteerName, eventTitle, shifts, editToken, orgSlug } = p.data as {
    volunteerName: string
    eventTitle: string
    shifts: { label: string; date: string; startTime: string; endTime: string }[]
    editToken: string
    orgSlug?: string
  }
  const editUrl = myPageUrl(orgSlug, editToken)
  const firstName = volunteerName.split(" ")[0]
  const subject = `Inscription confirmée — ${eventTitle} 🎉`

  const text = [
    `Hello ${firstName} !`,
    ``,
    `Super, ton inscription pour ${eventTitle} est confirmée !`,
    ``,
    `Tes créneaux :`,
    ...shifts.map((s) => `  • ${s.label} — ${s.date} · ${s.startTime}–${s.endTime}`),
    ``,
    `Un empêchement ? Tu peux gérer tes inscriptions ici :`,
    editUrl,
    ``,
    `Un grand M E R C I et à très vite !`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! 🎉</h2>
    <p style="margin:0 0 1.25em;color:#555">Super, ton inscription pour <strong>${escapeHtml(eventTitle)}</strong> est confirmée !</p>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px">
      ${shifts.map((s) => `
        <div style="padding:6px 0;border-bottom:1px solid #e5e7eb;last-child:border:0">
          <strong style="color:#111">${escapeHtml(s.label)}</strong>
          <span style="color:#666;font-size:0.9em"> — ${escapeHtml(s.date)} · ${escapeHtml(s.startTime)}–${escapeHtml(s.endTime)}</span>
        </div>`).join("")}
    </div>
    <p style="margin-top:1.5em">${btn(editUrl, "Gérer mes inscriptions")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">Un grand M E R C I et à très vite ! 🙌</p>
  `)

  return { subject, html, text }
}

// ── Invitation d'un membre ───────────────────────────────────────────────────

function renderMemberInvite(p: NotificationPayload): RenderedEmail {
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

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! 👋</h2>
    <p style="margin:0 0 1em;color:#555">On a besoin de bénévoles géniaux comme toi pour <strong>${escapeHtml(eventTitle)}</strong> !</p>
    ${message ? `<div style="background:#f3f4f6;padding:14px;border-radius:10px;white-space:pre-wrap;margin-bottom:1em">${escapeHtml(message)}</div>` : ""}
    <p style="color:#555">📅 ${escapeHtml(eventDate)}${eventLocation ? `<br>📍 ${escapeHtml(eventLocation)}` : ""}</p>
    <p style="margin-top:1.5em">${btn(inviteUrl, "Voir les missions et m'inscrire")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">Un grand merci d'avance, une grosse bise et à très vite !<br><strong>${escapeHtml(organizationName)}</strong></p>
    <p style="color:#bbb;font-size:0.8em">Si tu ne peux pas participer, ignore cet email.</p>
  `)

  return { subject, html, text }
}

// ── Rappels auto ─────────────────────────────────────────────────────────────

type ReminderData = {
  volunteerName: string
  eventTitle: string
  organizationName: string
  shiftLabel: string
  shiftRoleName: string
  shiftDate: string
  shiftStart: string
  shiftEnd: string
  shiftLocation: string | null
  editToken: string
  hoursUntil?: number
  orgSlug?: string
}

function renderReminderJ2(p: NotificationPayload): RenderedEmail {
  const d = p.data as ReminderData
  const editUrl = myPageUrl(d.orgSlug, d.editToken)
  const firstName = d.volunteerName.split(" ")[0]
  const subject = `J-2 — On se retrouve bientôt ! ${d.eventTitle}`

  const text = [
    `Hello ${firstName} !`,
    ``,
    `Plus que 2 jours avant ${d.eventTitle}, on se réjouit de te retrouver !`,
    ``,
    `Ton créneau :`,
    `📅 ${d.shiftDate}`,
    `🕐 ${d.shiftStart}–${d.shiftEnd}`,
    d.shiftLocation ? `📍 ${d.shiftLocation}` : ``,
    `Mission : ${d.shiftRoleName}`,
    ``,
    `Un empêchement ? Préviens-nous le plus vite possible :`,
    editUrl,
    ``,
    `Une grosse bise et à très vite !`,
    d.organizationName,
  ].filter(Boolean).join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! 👋</h2>
    <p style="color:#555;margin:0 0 1.25em">Plus que 2 jours avant <strong>${escapeHtml(d.eventTitle)}</strong>, on se réjouit de te retrouver !</p>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;line-height:2">
      <div>📅 ${escapeHtml(d.shiftDate)}</div>
      <div>🕐 ${escapeHtml(d.shiftStart)}–${escapeHtml(d.shiftEnd)}</div>
      ${d.shiftLocation ? `<div>📍 ${escapeHtml(d.shiftLocation)}</div>` : ""}
      <div>Mission : <strong>${escapeHtml(d.shiftRoleName)}</strong></div>
    </div>
    <p style="margin-top:1.5em">${btn(editUrl, "Annuler si je ne peux plus venir")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">Une grosse bise et à très vite !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `)

  return { subject, html, text }
}

function renderReminderJ1(p: NotificationPayload): RenderedEmail {
  const d = p.data as ReminderData
  const editUrl = myPageUrl(d.orgSlug, d.editToken)
  const firstName = d.volunteerName.split(" ")[0]
  const subject = `Demain c'est le jour J — ${d.eventTitle} !`

  const text = [
    `Hello ${firstName} !`,
    ``,
    `C'est demain ! ${d.eventTitle} à ${d.shiftStart}${d.shiftLocation ? `, à ${d.shiftLocation}` : ""}.`,
    `Tu fais : ${d.shiftRoleName}`,
    ``,
    `Un empêchement de dernière minute ? Préviens-nous vite :`,
    editUrl,
    ``,
    `On se réjouit de te retrouver !`,
    d.organizationName,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! C'est demain ! 🙌</h2>
    <p style="color:#555;margin:0 0 1.25em"><strong>${escapeHtml(d.eventTitle)}</strong> demain à ${escapeHtml(d.shiftStart)}${d.shiftLocation ? `, à ${escapeHtml(d.shiftLocation)}` : ""}.</p>
    <p>Tu fais : <strong>${escapeHtml(d.shiftRoleName)}</strong></p>
    <p style="margin-top:1.5em">${btn(editUrl, "Gérer mon inscription")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">On se réjouit de te retrouver !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `)

  return { subject, html, text }
}

function renderReminderDd(p: NotificationPayload): RenderedEmail {
  const d = p.data as ReminderData
  const editUrl = myPageUrl(d.orgSlug, d.editToken)
  const firstName = d.volunteerName.split(" ")[0]
  const hoursLabel = d.hoursUntil && d.hoursUntil > 0 ? `dans ${d.hoursUntil}h` : "très bientôt"
  const subject = `C'est aujourd'hui — RDV ${hoursLabel} ! ${d.eventTitle}`

  const text = [
    `Hello ${firstName} !`,
    ``,
    `C'est aujourd'hui ! RDV ${hoursLabel} pour ${d.eventTitle}.`,
    d.shiftLocation ? `📍 ${d.shiftLocation}` : ``,
    `🕐 ${d.shiftStart}`,
    `Mission : ${d.shiftRoleName}`,
    ``,
    editUrl,
    ``,
    `On se réjouit de te retrouver !`,
    d.organizationName,
  ].filter(Boolean).join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! C'est aujourd'hui 🎉</h2>
    <p style="color:#555;margin:0 0 1.25em">RDV <strong>${hoursLabel}</strong> pour <strong>${escapeHtml(d.eventTitle)}</strong> !</p>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;line-height:2">
      ${d.shiftLocation ? `<div>📍 ${escapeHtml(d.shiftLocation)}</div>` : ""}
      <div>🕐 ${escapeHtml(d.shiftStart)}</div>
      <div>Mission : <strong>${escapeHtml(d.shiftRoleName)}</strong></div>
    </div>
    <p style="margin-top:1.5em">${btn(editUrl, "Voir mon inscription")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">On se réjouit de te retrouver !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `)

  return { subject, html, text }
}

// ── Rappel manuel ─────────────────────────────────────────────────────────────

function renderManualReminder(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    volunteerName: string
    organizationName: string
    eventTitle: string
    customMessage: string
    shifts: { label: string; date: string; startTime: string; endTime: string; roleName: string }[]
    editToken: string
    orgSlug?: string
  }
  const editUrl = myPageUrl(d.orgSlug, d.editToken)
  const firstName = d.volunteerName.split(" ")[0]
  const subject = `Rappel — ${d.eventTitle}`

  const text = [
    `Hello ${firstName} !`,
    ``,
    d.customMessage,
    ``,
    `Tes créneaux pour ${d.eventTitle} :`,
    ...d.shifts.map((s) => `  • ${s.date} · ${s.label} · ${s.startTime}–${s.endTime}`),
    ``,
    `Gérer tes inscriptions : ${editUrl}`,
    ``,
    `Un grand M E R C I, une grosse bise et à très vite !`,
    d.organizationName,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! 👋</h2>
    ${d.customMessage ? `<div style="background:#f3f4f6;padding:14px;border-radius:10px;white-space:pre-wrap;margin-bottom:1.25em">${escapeHtml(d.customMessage)}</div>` : ""}
    <p style="color:#555">Tes créneaux pour <strong>${escapeHtml(d.eventTitle)}</strong> :</p>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px">
      ${d.shifts.map((s) => `
        <div style="padding:6px 0;border-bottom:1px solid #e5e7eb">
          <strong>${escapeHtml(s.label)}</strong>
          <span style="color:#666;font-size:0.9em"> — ${escapeHtml(s.date)} · ${escapeHtml(s.startTime)}–${escapeHtml(s.endTime)}</span>
        </div>`).join("")}
    </div>
    <p style="margin-top:1.5em">${btn(editUrl, "Gérer mes inscriptions")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">Un grand M E R C I, une grosse bise et à très vite !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `)

  return { subject, html, text }
}

// ── Notif modification d'un shift ────────────────────────────────────────────

function renderShiftModified(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    volunteerName: string
    eventTitle: string
    shiftLabel: string
    oldDate: string
    newDate: string
    oldStart: string
    newStart: string
    oldEnd: string
    newEnd: string
    editToken: string
    orgSlug?: string
  }
  const editUrl = myPageUrl(d.orgSlug, d.editToken)
  const firstName = d.volunteerName.split(" ")[0]
  const subject = `Info : changement d'horaire — ${d.eventTitle}`

  const text = [
    `Hello ${firstName} !`,
    ``,
    `Petite info : le créneau "${d.shiftLabel}" pour ${d.eventTitle} a changé d'horaire.`,
    ``,
    `Avant  : ${d.oldDate} · ${d.oldStart}–${d.oldEnd}`,
    `Nouveau : ${d.newDate} · ${d.newStart}–${d.newEnd}`,
    ``,
    `Si ces nouveaux horaires ne te conviennent pas, tu peux gérer ton inscription ici :`,
    editUrl,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} !</h2>
    <p style="color:#555">Petite info : le créneau <strong>${escapeHtml(d.shiftLabel)}</strong> pour <strong>${escapeHtml(d.eventTitle)}</strong> a changé d'horaire.</p>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;margin:1em 0">
      <div style="color:#999;text-decoration:line-through;font-size:0.9em">${escapeHtml(d.oldDate)} · ${escapeHtml(d.oldStart)}–${escapeHtml(d.oldEnd)}</div>
      <div style="font-weight:600;margin-top:4px">→ ${escapeHtml(d.newDate)} · ${escapeHtml(d.newStart)}–${escapeHtml(d.newEnd)}</div>
    </div>
    <p style="color:#555;font-size:0.9em">Si ces nouveaux horaires ne te conviennent pas, tu peux gérer ton inscription ci-dessous.</p>
    <p style="margin-top:1.5em">${btn(editUrl, "Gérer mon inscription")}</p>
  `)

  return { subject, html, text }
}

// ── Notif annulation d'un shift ──────────────────────────────────────────────

function renderShiftCancelled(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    volunteerName: string
    eventTitle: string
    orgSlug: string
    eventSlug: string
    shiftLabel: string
    shiftDate: string
  }
  const eventUrl = eventPublicUrl(d.orgSlug, d.eventSlug)
  const firstName = d.volunteerName.split(" ")[0]
  const subject = `Info : créneau annulé — ${d.eventTitle}`

  const text = [
    `Hello ${firstName} !`,
    ``,
    `Le créneau "${d.shiftLabel}" du ${d.shiftDate} pour ${d.eventTitle} a malheureusement été annulé.`,
    ``,
    `D'autres créneaux sont peut-être disponibles, jette un œil ici :`,
    eventUrl,
    ``,
    `Merci pour ta compréhension et toutes nos excuses pour la gêne occasionnée !`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} !</h2>
    <p style="color:#555">Le créneau <strong>${escapeHtml(d.shiftLabel)}</strong> du ${escapeHtml(d.shiftDate)} pour <strong>${escapeHtml(d.eventTitle)}</strong> a malheureusement été annulé.</p>
    <p style="color:#555">D'autres créneaux sont peut-être disponibles, jette un œil ici :</p>
    <p style="margin-top:1.5em">${btn(eventUrl, "Voir les créneaux disponibles")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">Merci pour ta compréhension et toutes nos excuses pour la gêne occasionnée !</p>
  `)

  return { subject, html, text }
}

// ── Inscription annulée (suite à #46 cancel public) ──────────────────────────

function renderRegistrationCancelled(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    volunteerName: string
    eventTitle: string
    orgSlug: string
    eventSlug: string
    shiftLabel: string
  }
  const eventUrl = eventPublicUrl(d.orgSlug, d.eventSlug)
  const firstName = d.volunteerName.split(" ")[0]
  const subject = `Désinscription confirmée — ${d.eventTitle}`

  const text = [
    `Hello ${firstName} !`,
    ``,
    `Ta désinscription du créneau "${d.shiftLabel}" pour ${d.eventTitle} est bien prise en compte.`,
    ``,
    `Si tu changes d'avis, les créneaux disponibles sont par ici :`,
    eventUrl,
    ``,
    `On espère te revoir bientôt !`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} !</h2>
    <p style="color:#555">Ta désinscription du créneau <strong>${escapeHtml(d.shiftLabel)}</strong> pour <strong>${escapeHtml(d.eventTitle)}</strong> est bien prise en compte.</p>
    <p style="color:#555">Si tu changes d'avis, les créneaux disponibles sont par ici :</p>
    <p style="margin-top:1.5em">${btn(eventUrl, "Voir les créneaux disponibles")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">On espère te revoir bientôt ! 🙏</p>
  `)

  return { subject, html, text }
}

// ── Invitation d'un admin ────────────────────────────────────────────────────

function renderAdminInvite(p: NotificationPayload): RenderedEmail {
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
  `)

  return { subject, html, text }
}

// ── Notif admin (interne) ────────────────────────────────────────────────────

function renderAdminNotification(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    eventTitle: string
    volunteerName: string
    volunteerEmail: string
    shifts: { label: string; roleName: string; date: string; startTime: string; endTime: string }[]
  }
  const subject = `Nouvelle inscription — ${d.eventTitle}`

  const shiftLines = d.shifts.map((s) => {
    const name = s.label && s.label !== s.roleName ? `${s.roleName} — ${s.label}` : s.roleName
    return `  • ${name} · ${s.date} · ${s.startTime}–${s.endTime}`
  })

  const text = [
    `${d.volunteerName} (${d.volunteerEmail}) vient de s'inscrire à ${d.eventTitle}.`,
    ``,
    ...shiftLines,
  ].join("\n")

  const html = `
    <p><strong>${escapeHtml(d.volunteerName)}</strong> (${escapeHtml(d.volunteerEmail)}) vient de s'inscrire à <strong>${escapeHtml(d.eventTitle)}</strong>.</p>
    <ul style="padding-left:1.2em;line-height:1.8">
      ${d.shifts.map((s) => {
        const name = s.label && s.label !== s.roleName
          ? `${escapeHtml(s.roleName)} — ${escapeHtml(s.label)}`
          : escapeHtml(s.roleName)
        return `<li><strong>${name}</strong> · ${escapeHtml(s.date)} · ${escapeHtml(s.startTime)}–${escapeHtml(s.endTime)}</li>`
      }).join("")}
    </ul>
  `

  return { subject, html, text }
}

// ── Réinitialisation mot de passe ────────────────────────────────────────────

function renderPasswordReset(p: NotificationPayload): RenderedEmail {
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
  `)

  return { subject, html, text }
}

// ── Bienvenue après activation du compte admin ───────────────────────────────

function renderAdminWelcome(p: NotificationPayload): RenderedEmail {
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
  `)

  return { subject, html, text }
}
