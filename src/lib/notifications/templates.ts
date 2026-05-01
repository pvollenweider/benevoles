/**
 * Templates for every notification kind. Plain-text + HTML.
 * Keep them short and transactional — the platform is NOT a mailing tool.
 */

import type { NotificationPayload } from "./types"

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

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
  }
}

// ── Inscription confirmée ────────────────────────────────────────────────────

function renderConfirmation(p: NotificationPayload): RenderedEmail {
  const { volunteerName, eventTitle, shifts, editToken } = p.data as {
    volunteerName: string
    eventTitle: string
    shifts: { label: string; date: string; startTime: string; endTime: string }[]
    editToken: string
  }
  const editUrl = `${APP_URL}/my/${editToken}`
  const subject = `Confirmation d'inscription — ${eventTitle}`

  const text = [
    `Merci ${volunteerName} !`,
    ``,
    `Vous êtes inscrit·e pour ${eventTitle} :`,
    ...shifts.map((s) => `  • ${s.label} — ${s.date} de ${s.startTime} à ${s.endTime}`),
    ``,
    `Voir / annuler vos inscriptions : ${editUrl}`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Merci pour votre inscription, ${escapeHtml(volunteerName)} !</h2>
    <p>Vous êtes inscrit·e pour <strong>${escapeHtml(eventTitle)}</strong> :</p>
    <ul style="padding-left:1.2em">
      ${shifts.map((s) => `<li><strong>${escapeHtml(s.label)}</strong> — ${escapeHtml(s.date)} de ${escapeHtml(s.startTime)} à ${escapeHtml(s.endTime)}</li>`).join("")}
    </ul>
    <p style="margin-top:1.5em">${btn(editUrl, "Voir / annuler mes inscriptions")}</p>
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
  const inviteUrl = `${APP_URL}/${orgSlug}/${eventSlug}?token=${token}`
  const subject = `[${organizationName}] On a besoin de toi pour ${eventTitle}`

  const text = [
    `Bonjour ${memberName},`,
    ``,
    `${organizationName} a besoin de toi pour ${eventTitle}.`,
    message ? `\n${message}\n` : ``,
    `📅 ${eventDate}`,
    eventLocation ? `📍 ${eventLocation}` : ``,
    ``,
    `Voir les missions : ${inviteUrl}`,
  ].filter(Boolean).join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Bonjour ${escapeHtml(memberName)},</h2>
    <p>${escapeHtml(organizationName)} a besoin de toi pour <strong>${escapeHtml(eventTitle)}</strong>.</p>
    ${message ? `<p style="background:#f3f4f6;padding:12px;border-radius:8px">${escapeHtml(message)}</p>` : ""}
    <p>📅 ${escapeHtml(eventDate)}${eventLocation ? `<br>📍 ${escapeHtml(eventLocation)}` : ""}</p>
    <p style="margin-top:1.5em">${btn(inviteUrl, "Voir les missions et m'inscrire")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">Si tu ne peux pas, ignore cet email.</p>
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
}

function renderReminderJ2(p: NotificationPayload): RenderedEmail {
  const d = p.data as ReminderData
  const editUrl = `${APP_URL}/my/${d.editToken}`
  const subject = `J-2 — ${d.eventTitle}`

  const text = [
    `Bonjour ${d.volunteerName},`,
    ``,
    `Tu es inscrit·e pour ${d.eventTitle} dans 2 jours :`,
    `📅 ${d.shiftDate}`,
    `🕐 ${d.shiftStart} - ${d.shiftEnd}`,
    d.shiftLocation ? `📍 ${d.shiftLocation}` : ``,
    `Mission : ${d.shiftRoleName}`,
    ``,
    `Si tu ne peux plus venir, merci de nous prévenir : ${editUrl}`,
  ].filter(Boolean).join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Plus que 2 jours !</h2>
    <p>Bonjour ${escapeHtml(d.volunteerName)}, on se retrouve bientôt pour <strong>${escapeHtml(d.eventTitle)}</strong> :</p>
    <ul style="padding-left:1.2em;line-height:1.8">
      <li>📅 ${escapeHtml(d.shiftDate)}</li>
      <li>🕐 ${escapeHtml(d.shiftStart)} – ${escapeHtml(d.shiftEnd)}</li>
      ${d.shiftLocation ? `<li>📍 ${escapeHtml(d.shiftLocation)}</li>` : ""}
      <li>Mission : <strong>${escapeHtml(d.shiftRoleName)}</strong></li>
    </ul>
    <p style="margin-top:1.5em">${btn(editUrl, "Annuler si je ne peux plus venir")}</p>
    <p style="color:#888;font-size:0.85em">À très vite,<br>${escapeHtml(d.organizationName)}</p>
  `)

  return { subject, html, text }
}

function renderReminderJ1(p: NotificationPayload): RenderedEmail {
  const d = p.data as ReminderData
  const editUrl = `${APP_URL}/my/${d.editToken}`
  const subject = `Demain — ${d.eventTitle}`

  const text = `Plus que 24h ! ${d.eventTitle} demain à ${d.shiftStart}${d.shiftLocation ? `, à ${d.shiftLocation}` : ""}.\nTu fais : ${d.shiftRoleName}\n\n${editUrl}`

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Plus que 24h !</h2>
    <p><strong>${escapeHtml(d.eventTitle)}</strong> demain à ${escapeHtml(d.shiftStart)}${d.shiftLocation ? `, à ${escapeHtml(d.shiftLocation)}` : ""}.</p>
    <p>Tu fais : <strong>${escapeHtml(d.shiftRoleName)}</strong></p>
    <p style="margin-top:1.5em">${btn(editUrl, "Gérer mon inscription")}</p>
  `)

  return { subject, html, text }
}

function renderReminderDd(p: NotificationPayload): RenderedEmail {
  const d = p.data as ReminderData
  const editUrl = `${APP_URL}/my/${d.editToken}`
  const subject = `C'est aujourd'hui — ${d.eventTitle}`
  const hoursLabel = d.hoursUntil && d.hoursUntil > 0 ? `dans ${d.hoursUntil}h` : "très bientôt"

  const text = `RDV ${hoursLabel} ! ${d.shiftLocation ?? ""} à ${d.shiftStart}\n\n${editUrl}`

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">RDV ${hoursLabel} !</h2>
    ${d.shiftLocation ? `<p>📍 ${escapeHtml(d.shiftLocation)}</p>` : ""}
    <p>🕐 ${escapeHtml(d.shiftStart)}</p>
    <p>Mission : <strong>${escapeHtml(d.shiftRoleName)}</strong></p>
    <p style="margin-top:1.5em">${btn(editUrl, "Voir mon inscription")}</p>
  `)

  return { subject, html, text }
}

// ── Rappel manuel J-7 ────────────────────────────────────────────────────────

function renderManualReminder(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    volunteerName: string
    organizationName: string
    eventTitle: string
    customMessage: string
    shifts: { label: string; date: string; startTime: string; endTime: string; roleName: string }[]
    editToken: string
  }
  const editUrl = `${APP_URL}/my/${d.editToken}`
  const subject = `Rappel — ${d.eventTitle}`

  const text = [
    `Bonjour ${d.volunteerName},`,
    ``,
    d.customMessage,
    ``,
    `Vos créneaux pour ${d.eventTitle} :`,
    ...d.shifts.map((s) => `  • ${s.date} · ${s.label} · ${s.startTime}–${s.endTime}`),
    ``,
    `Gérer vos inscriptions : ${editUrl}`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Bonjour ${escapeHtml(d.volunteerName)},</h2>
    ${d.customMessage ? `<div style="background:#f3f4f6;padding:14px;border-radius:8px;white-space:pre-wrap">${escapeHtml(d.customMessage)}</div>` : ""}
    <p style="margin-top:1.5em">Vos créneaux pour <strong>${escapeHtml(d.eventTitle)}</strong> :</p>
    <ul style="padding-left:1.2em;line-height:1.8">
      ${d.shifts.map((s) => `<li>${escapeHtml(s.date)} · <strong>${escapeHtml(s.label)}</strong> · ${escapeHtml(s.startTime)}–${escapeHtml(s.endTime)}</li>`).join("")}
    </ul>
    <p style="margin-top:1.5em">${btn(editUrl, "Gérer mes inscriptions")}</p>
    <p style="color:#888;font-size:0.85em">${escapeHtml(d.organizationName)}</p>
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
  }
  const editUrl = `${APP_URL}/my/${d.editToken}`
  const subject = `Changement d'horaire — ${d.eventTitle}`

  const text = [
    `Bonjour ${d.volunteerName},`,
    ``,
    `Le créneau "${d.shiftLabel}" pour ${d.eventTitle} a changé :`,
    `Avant : ${d.oldDate} de ${d.oldStart} à ${d.oldEnd}`,
    `Maintenant : ${d.newDate} de ${d.newStart} à ${d.newEnd}`,
    ``,
    `Si ces nouveaux horaires ne te conviennent pas : ${editUrl}`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Changement d'horaire</h2>
    <p>Bonjour ${escapeHtml(d.volunteerName)}, le créneau <strong>${escapeHtml(d.shiftLabel)}</strong> pour <strong>${escapeHtml(d.eventTitle)}</strong> a été modifié :</p>
    <p><span style="text-decoration:line-through;color:#999">${escapeHtml(d.oldDate)} · ${escapeHtml(d.oldStart)}–${escapeHtml(d.oldEnd)}</span></p>
    <p style="font-weight:600">${escapeHtml(d.newDate)} · ${escapeHtml(d.newStart)}–${escapeHtml(d.newEnd)}</p>
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
  const eventUrl = `${APP_URL}/${d.orgSlug}/${d.eventSlug}`
  const subject = `Créneau annulé — ${d.eventTitle}`

  const text = [
    `Bonjour ${d.volunteerName},`,
    ``,
    `Le créneau "${d.shiftLabel}" du ${d.shiftDate} a été annulé.`,
    ``,
    `Tu peux te réinscrire sur un autre créneau : ${eventUrl}`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Créneau annulé</h2>
    <p>Bonjour ${escapeHtml(d.volunteerName)},</p>
    <p>Le créneau <strong>${escapeHtml(d.shiftLabel)}</strong> du ${escapeHtml(d.shiftDate)} pour <strong>${escapeHtml(d.eventTitle)}</strong> a été annulé.</p>
    <p style="margin-top:1.5em">${btn(eventUrl, "Voir les autres créneaux")}</p>
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
  const eventUrl = `${APP_URL}/${d.orgSlug}/${d.eventSlug}`
  const subject = `Désinscription — ${d.eventTitle}`

  const text = [
    `Bonjour ${d.volunteerName},`,
    ``,
    `Ta désinscription du créneau "${d.shiftLabel}" pour ${d.eventTitle} est confirmée.`,
    ``,
    `Si tu changes d'avis : ${eventUrl}`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Désinscription confirmée</h2>
    <p>Bonjour ${escapeHtml(d.volunteerName)},</p>
    <p>Ta désinscription du créneau <strong>${escapeHtml(d.shiftLabel)}</strong> pour <strong>${escapeHtml(d.eventTitle)}</strong> est bien prise en compte.</p>
    <p style="margin-top:1.5em">${btn(eventUrl, "Voir les créneaux disponibles")}</p>
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
    `Vous avez été invité·e à rejoindre ${d.organizationName} en tant qu'administrateur sur Bénévoles.`,
    ``,
    `Créez votre compte en cliquant sur ce lien (valable 7 jours) :`,
    d.inviteUrl,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.5em">Bonjour ${escapeHtml(d.adminName)},</h2>
    <p>Vous avez été invité·e à rejoindre <strong>${escapeHtml(d.organizationName)}</strong> en tant qu'administrateur sur Bénévoles.</p>
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
    shifts: { label: string }[]
  }
  const subject = `Nouvelle inscription — ${d.eventTitle}`

  const text = `${d.volunteerName} (${d.volunteerEmail}) vient de s'inscrire à ${d.eventTitle}.\nCréneaux : ${d.shifts.map((s) => s.label).join(", ")}`

  const html = `
    <p><strong>${escapeHtml(d.volunteerName)}</strong> (${escapeHtml(d.volunteerEmail)}) vient de s'inscrire à <strong>${escapeHtml(d.eventTitle)}</strong>.</p>
    <p>Créneaux : ${d.shifts.map((s) => escapeHtml(s.label)).join(", ")}</p>
  `

  return { subject, html, text }
}
