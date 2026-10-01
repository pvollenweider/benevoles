// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Messages to registered volunteers: automatic reminders (J-2, J-1, same day), manual
 * reminder and targeted message.
 */

import type { NotificationPayload } from "../types"
import { clockTime } from "../../gantt-utils"
import { MAP_LINK_EMAIL_LABEL } from "../../map-link"
import { shiftInfoLines } from "../../shift-info"
import { myPageUrl, escapeHtml, btn, wrap, type RenderedEmail } from "./shared"

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
  /** Map link of the meeting point (#191). */
  shiftMapUrl?: string | null
  shiftContactName?: string | null
  shiftContactPhone?: string | null
  shiftInstructions?: string | null
  editToken: string
  hoursUntil?: number
  orgSlug?: string
}

/** Contact and instructions of the reminded shift (the place is already in each template). */
function reminderExtras(d: ReminderData) {
  return shiftInfoLines({ contactName: d.shiftContactName, contactPhone: d.shiftContactPhone, instructions: d.shiftInstructions })
}
const extrasText = (d: ReminderData) => [d.shiftMapUrl ? `Voir sur la carte : ${d.shiftMapUrl}` : "", ...reminderExtras(d).map((l) => `${l.label} : ${l.text}`)].filter(Boolean)
const extrasHtml = (d: ReminderData) => [d.shiftMapUrl ? `<div><a href="${escapeHtml(d.shiftMapUrl)}">${MAP_LINK_EMAIL_LABEL}</a></div>` : "", ...reminderExtras(d).map((l) => `<div>${escapeHtml(l.label)} : ${escapeHtml(l.text)}</div>`)].join("")

export function renderReminderJ2(p: NotificationPayload): RenderedEmail {
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
    `🕐 ${clockTime(d.shiftStart)}–${clockTime(d.shiftEnd)}`,
    d.shiftLocation ? `📍 ${d.shiftLocation}` : ``,
    `Mission : ${d.shiftRoleName}`,
    ...extrasText(d),
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
      <div>🕐 ${escapeHtml(clockTime(d.shiftStart))}–${escapeHtml(clockTime(d.shiftEnd))}</div>
      ${d.shiftLocation ? `<div>📍 ${escapeHtml(d.shiftLocation)}</div>` : ""}
      <div>Mission : <strong>${escapeHtml(d.shiftRoleName)}</strong></div>
      ${extrasHtml(d)}
    </div>
    <p style="margin-top:1.5em">${btn(editUrl, "Annuler si je ne peux plus venir")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">Une grosse bise et à très vite !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `, `${escapeHtml(d.shiftRoleName)} · ${escapeHtml(d.shiftDate)} · ${escapeHtml(clockTime(d.shiftStart))}–${escapeHtml(clockTime(d.shiftEnd))}`)

  return { subject, html, text }
}

export function renderReminderJ1(p: NotificationPayload): RenderedEmail {
  const d = p.data as ReminderData
  const editUrl = myPageUrl(d.orgSlug, d.editToken)
  const firstName = d.volunteerName.split(" ")[0]
  const subject = `Demain c'est le jour J — ${d.eventTitle} !`

  const text = [
    `Hello ${firstName} !`,
    ``,
    `C'est demain ! ${d.eventTitle} à ${clockTime(d.shiftStart)}${d.shiftLocation ? `, à ${d.shiftLocation}` : ""}.`,
    `Tu fais : ${d.shiftRoleName}`,
    ...extrasText(d),
    ``,
    `Un empêchement de dernière minute ? Préviens-nous vite :`,
    editUrl,
    ``,
    `On se réjouit de te retrouver !`,
    d.organizationName,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! C'est demain ! 🙌</h2>
    <p style="color:#555;margin:0 0 1.25em"><strong>${escapeHtml(d.eventTitle)}</strong> demain à ${escapeHtml(clockTime(d.shiftStart))}${d.shiftLocation ? `, à ${escapeHtml(d.shiftLocation)}` : ""}.</p>
    <p>Tu fais : <strong>${escapeHtml(d.shiftRoleName)}</strong></p>
    ${reminderExtras(d).length ? `<div style="background:#f9fafb;border-radius:10px;padding:14px 16px;line-height:2">${extrasHtml(d)}</div>` : ""}
    <p style="margin-top:1.5em">${btn(editUrl, "Gérer mon inscription")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">On se réjouit de te retrouver !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `, `RDV demain à ${clockTime(d.shiftStart)}${d.shiftLocation ? ` · ${d.shiftLocation}` : ""} — mission : ${d.shiftRoleName}`)

  return { subject, html, text }
}

export function renderReminderDd(p: NotificationPayload): RenderedEmail {
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
    `🕐 ${clockTime(d.shiftStart)}`,
    `Mission : ${d.shiftRoleName}`,
    ...extrasText(d),
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
      <div>🕐 ${escapeHtml(clockTime(d.shiftStart))}</div>
      <div>Mission : <strong>${escapeHtml(d.shiftRoleName)}</strong></div>
      ${extrasHtml(d)}
    </div>
    <p style="margin-top:1.5em">${btn(editUrl, "Voir mon inscription")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">On se réjouit de te retrouver !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `, `${d.shiftRoleName} · RDV ${hoursLabel}${d.shiftLocation ? ` à ${d.shiftLocation}` : ""}`)

  return { subject, html, text }
}

// ── Rappel manuel ─────────────────────────────────────────────────────────────

export function renderManualReminder(p: NotificationPayload): RenderedEmail {
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
    ...d.shifts.map((s) => `  • ${s.date} · ${s.label} · ${clockTime(s.startTime)}–${clockTime(s.endTime)}`),
    ``,
    `Gérer tes inscriptions : ${editUrl}`,
    ``,
    `Un grand M E R C I, une grosse bise et à très vite !`,
    d.organizationName,
  ].join("\n")

  const preheader = d.customMessage
    ? d.customMessage.slice(0, 100) + (d.customMessage.length > 100 ? "…" : "")
    : `Un message de ${d.organizationName} concernant ${d.eventTitle}.`
  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! 👋</h2>
    ${d.customMessage ? `<div style="background:#f3f4f6;padding:14px;border-radius:10px;white-space:pre-wrap;margin-bottom:1.25em">${escapeHtml(d.customMessage)}</div>` : ""}
    <p style="color:#555">Tes créneaux pour <strong>${escapeHtml(d.eventTitle)}</strong> :</p>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px">
      ${d.shifts.map((s) => `
        <div style="padding:6px 0;border-bottom:1px solid #e5e7eb">
          <strong>${escapeHtml(s.label)}</strong>
          <span style="color:#666;font-size:0.9em"> · ${escapeHtml(s.date)} · ${escapeHtml(clockTime(s.startTime))}–${escapeHtml(clockTime(s.endTime))}</span>
        </div>`).join("")}
    </div>
    <p style="margin-top:1.5em">${btn(editUrl, "Gérer mes inscriptions")}</p>
    <p style="color:#888;font-size:0.85em;margin-top:2em">Un grand M E R C I, une grosse bise et à très vite !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `, preheader)

  return { subject, html, text }
}

// ── Message ciblé (#396) ─────────────────────────────────────────────────────

export function renderTargetedMessage(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    volunteerName: string
    organizationName: string
    eventTitle: string
    subject: string
    message: string
    /** The volunteer's shifts in the audience; empty for a waitlist message. */
    shifts: { label: string; date: string; startTime: string; endTime: string }[]
    /** Absent for the waitlist: the personal page only opens confirmed registrations. */
    editToken?: string
    orgSlug?: string
    /** Invited without a shift (#481): their invitation link, to choose shifts. */
    signupUrl?: string
  }
  const editUrl = d.editToken ? myPageUrl(d.orgSlug, d.editToken) : null
  const firstName = d.volunteerName.split(" ")[0]
  const subject = `${d.subject} — ${d.eventTitle}`

  const text = [
    `Hello ${firstName} !`,
    ``,
    d.message,
    ``,
    ...(d.shifts.length > 0
      ? [`Tes créneaux concernés pour ${d.eventTitle} :`, ...d.shifts.map((s) => `  • ${s.date} · ${s.label} · ${clockTime(s.startTime)}–${clockTime(s.endTime)}`), ``]
      : []),
    ...(editUrl ? [`Gérer tes inscriptions : ${editUrl}`, ``] : []),
    ...(d.signupUrl ? [`Choisir tes créneaux : ${d.signupUrl}`, ``] : []),
    `À très vite !`,
    d.organizationName,
  ].join("\n")

  const preheader = d.message.slice(0, 100) + (d.message.length > 100 ? "…" : "")
  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! 👋</h2>
    <p style="color:#555;margin:0 0 1em">Un message de <strong>${escapeHtml(d.organizationName)}</strong> au sujet de <strong>${escapeHtml(d.eventTitle)}</strong>.</p>
    <div style="background:#f3f4f6;padding:14px;border-radius:10px;white-space:pre-wrap;margin-bottom:1.25em">${escapeHtml(d.message)}</div>
    ${d.shifts.length > 0 ? `
    <p style="color:#555">Tes créneaux concernés :</p>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px">
      ${d.shifts.map((s) => `
        <div style="padding:6px 0;border-bottom:1px solid #e5e7eb">
          <strong>${escapeHtml(s.label)}</strong>
          <span style="color:#666;font-size:0.9em"> · ${escapeHtml(s.date)} · ${escapeHtml(clockTime(s.startTime))}–${escapeHtml(clockTime(s.endTime))}</span>
        </div>`).join("")}
    </div>` : ""}
    ${editUrl ? `<p style="margin-top:1.5em">${btn(editUrl, "Gérer mes inscriptions")}</p>` : ""}
    ${d.signupUrl ? `<p style="margin-top:1.5em">${btn(d.signupUrl, "Choisir mes créneaux")}</p>` : ""}
    <p style="color:#888;font-size:0.85em;margin-top:2em">À très vite !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `, preheader)

  return { subject, html, text }
}
