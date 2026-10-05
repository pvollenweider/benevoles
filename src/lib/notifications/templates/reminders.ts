// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Messages to registered volunteers: automatic reminders (J-2, J-1, same day), manual
 * reminder and targeted message.
 */

import type { NotificationPayload } from "../types"
import { clockTime, fmtRange } from "../../gantt-utils"
import { emergencyNoteFor, shiftInfoText, type ShiftInfo } from "../../shift-info"
import { myPageUrl, escapeHtml, shiftInfoHtml, btn, wrap, type RenderedEmail } from "./shared"

// ── Rappels auto (#672 : un email par bénévole, événement et jour) ──────────

/** One shift of a reminder group, in time order. */
export type ReminderShift = { label: string; roleName: string; date: string; startTime: string; endTime: string } & ShiftInfo

type ReminderData = {
  volunteerName: string
  eventTitle: string
  organizationName: string
  /** Every active shift of this volunteer, event and local day still due this window (#672), sorted by start. */
  shifts: ReminderShift[]
  editToken: string
  /** Hours until the group's earliest shift (reminder_dd only). */
  hoursUntil?: number
  orgSlug?: string
}

// Role and label joined like the rest of the emails (administration.ts, signup-recap.ts): no
// em-dash, "·" between role and variant only — never between a time and a role (below).
const roleLine = (s: ReminderShift) => (s.label && s.label !== s.roleName ? `${s.roleName} · ${s.label}` : s.roleName)

/** The emergency note once per email, when a shift shows the event's day-of contact (#560). */
const noteText = (shifts: ReminderShift[]): string[] => {
  const note = emergencyNoteFor(shifts)
  return note ? [note] : []
}
const noteHtml = (shifts: ReminderShift[]): string => {
  const note = emergencyNoteFor(shifts)
  return note ? `<p style="color:#111;font-weight:600;font-size:0.9em;border-left:4px solid #9ca3af;padding-left:8px;margin:0.75em 0 0">${escapeHtml(note)}</p>` : ""
}

/** Plain-text block for one shift of a group, indented so it reads as a sub-item. */
function shiftBlockText(s: ReminderShift): string[] {
  return [
    `  • ${fmtRange(s.startTime, s.endTime)} : ${roleLine(s)}`,
    ...shiftInfoText(s).map((l) => `      ${l}`),
  ]
}

/** One shift of a group as a list item (screen readers announce the list and its items, #672). */
function shiftBlockHtml(s: ReminderShift): string {
  return `
    <li style="list-style:none;padding:6px 0;border-bottom:1px solid #e5e7eb">
      <strong>${escapeHtml(fmtRange(s.startTime, s.endTime))}</strong>
      <span style="color:#666;font-size:0.9em"> : ${escapeHtml(roleLine(s))}</span>
      ${shiftInfoHtml(s)}
    </li>`
}

export function renderReminderJ2(p: NotificationPayload): RenderedEmail {
  const d = p.data as ReminderData
  const editUrl = myPageUrl(d.orgSlug, d.editToken)
  const firstName = d.volunteerName.split(" ")[0]
  const first = d.shifts[0]
  const subject = `J-2 — On se retrouve bientôt ! ${d.eventTitle}`

  const text = d.shifts.length === 1
    ? [
        `Hello ${firstName} !`,
        ``,
        `Plus que 2 jours avant ${d.eventTitle}, on se réjouit de te retrouver !`,
        ``,
        `Ton créneau :`,
        `📅 ${first.date}`,
        `🕐 ${fmtRange(first.startTime, first.endTime)}`,
        `Mission : ${roleLine(first)}`,
        ...shiftInfoText(first),
        ...noteText(d.shifts),
        ``,
        `Un empêchement ? Préviens-nous le plus vite possible :`,
        editUrl,
        ``,
        `Une grosse bise et à très vite !`,
        d.organizationName,
      ].filter(Boolean).join("\n")
    : [
        `Hello ${firstName} !`,
        ``,
        `Plus que 2 jours avant ${d.eventTitle}, on se réjouit de te retrouver !`,
        ``,
        `Tes créneaux du ${first.date} :`,
        ...d.shifts.flatMap(shiftBlockText),
        ...noteText(d.shifts),
        ``,
        `Un empêchement ? Préviens-nous le plus vite possible :`,
        editUrl,
        ``,
        `Une grosse bise et à très vite !`,
        d.organizationName,
      ].join("\n")

  const html = d.shifts.length === 1
    ? wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! 👋</h2>
    <p style="color:#555;margin:0 0 1.25em">Plus que 2 jours avant <strong>${escapeHtml(d.eventTitle)}</strong>, on se réjouit de te retrouver !</p>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;line-height:2">
      <div>📅 ${escapeHtml(first.date)}</div>
      <div>🕐 ${escapeHtml(fmtRange(first.startTime, first.endTime))}</div>
      <div>Mission : <strong>${escapeHtml(roleLine(first))}</strong></div>
      ${shiftInfoHtml(first)}
    </div>${noteHtml(d.shifts)}
    <p style="margin-top:1.5em">${btn(editUrl, "Annuler si je ne peux plus venir")}</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">Une grosse bise et à très vite !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `, `${escapeHtml(roleLine(first))} · ${escapeHtml(first.date)} · ${escapeHtml(fmtRange(first.startTime, first.endTime))}`)
    : wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! 👋</h2>
    <p style="color:#555;margin:0 0 1.25em">Plus que 2 jours avant <strong>${escapeHtml(d.eventTitle)}</strong>, on se réjouit de te retrouver !</p>
    <p style="color:#555;margin:0 0 0.5em">Tes créneaux du <strong>${escapeHtml(first.date)}</strong> :</p>
    <ul style="list-style:none;margin:0;padding:14px 16px;background:#f9fafb;border-radius:10px">
      ${d.shifts.map(shiftBlockHtml).join("")}
    </ul>${noteHtml(d.shifts)}
    <p style="margin-top:1.5em">${btn(editUrl, "Annuler un créneau si je ne peux plus venir")}</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">Une grosse bise et à très vite !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `, `${d.shifts.length} créneaux le ${escapeHtml(first.date)}`)

  return { subject, html, text }
}

export function renderReminderJ1(p: NotificationPayload): RenderedEmail {
  const d = p.data as ReminderData
  const editUrl = myPageUrl(d.orgSlug, d.editToken)
  const firstName = d.volunteerName.split(" ")[0]
  const first = d.shifts[0]
  const subject = `Demain c'est le jour J — ${d.eventTitle} !`

  const text = d.shifts.length === 1
    ? [
        `Hello ${firstName} !`,
        ``,
        `C'est demain ! ${d.eventTitle} à ${clockTime(first.startTime)}${first.locationDetails ? `, à ${first.locationDetails}` : ""}.`,
        `Tu fais : ${roleLine(first)}`,
        ...shiftInfoText(first),
        ...noteText(d.shifts),
        ``,
        `Un empêchement de dernière minute ? Préviens-nous vite :`,
        editUrl,
        ``,
        `On se réjouit de te retrouver !`,
        d.organizationName,
      ].join("\n")
    : [
        `Hello ${firstName} !`,
        ``,
        `C'est demain ! Tes créneaux du ${first.date} pour ${d.eventTitle} :`,
        ...d.shifts.flatMap(shiftBlockText),
        ...noteText(d.shifts),
        ``,
        `Un empêchement de dernière minute ? Préviens-nous vite :`,
        editUrl,
        ``,
        `On se réjouit de te retrouver !`,
        d.organizationName,
      ].join("\n")

  const html = d.shifts.length === 1
    ? wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! C'est demain ! 🙌</h2>
    <p style="color:#555;margin:0 0 1.25em"><strong>${escapeHtml(d.eventTitle)}</strong> demain à ${escapeHtml(clockTime(first.startTime))}${first.locationDetails ? `, à ${escapeHtml(first.locationDetails)}` : ""}.</p>
    <p>Tu fais : <strong>${escapeHtml(roleLine(first))}</strong></p>
    ${shiftInfoHtml(first)}${noteHtml(d.shifts)}
    <p style="margin-top:1.5em">${btn(editUrl, "Gérer mon inscription")}</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">On se réjouit de te retrouver !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `, `RDV demain à ${clockTime(first.startTime)}${first.locationDetails ? ` · ${first.locationDetails}` : ""} — mission : ${roleLine(first)}`)
    : wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! C'est demain ! 🙌</h2>
    <p style="color:#555;margin:0 0 0.5em"><strong>${escapeHtml(d.eventTitle)}</strong> demain : tes créneaux du <strong>${escapeHtml(first.date)}</strong> :</p>
    <ul style="list-style:none;margin:0;padding:14px 16px;background:#f9fafb;border-radius:10px">
      ${d.shifts.map(shiftBlockHtml).join("")}
    </ul>${noteHtml(d.shifts)}
    <p style="margin-top:1.5em">${btn(editUrl, "Gérer mes inscriptions")}</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">On se réjouit de te retrouver !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `, `${d.shifts.length} créneaux demain`)

  return { subject, html, text }
}

export function renderReminderDd(p: NotificationPayload): RenderedEmail {
  const d = p.data as ReminderData
  const editUrl = myPageUrl(d.orgSlug, d.editToken)
  const firstName = d.volunteerName.split(" ")[0]
  const first = d.shifts[0]
  const hoursLabel = d.hoursUntil && d.hoursUntil > 0 ? `dans ${d.hoursUntil}h` : "très bientôt"
  const subject = `C'est aujourd'hui — RDV ${hoursLabel} ! ${d.eventTitle}`

  const text = d.shifts.length === 1
    ? [
        `Hello ${firstName} !`,
        ``,
        `C'est aujourd'hui ! RDV ${hoursLabel} pour ${d.eventTitle}.`,
        `🕐 ${clockTime(first.startTime)}`,
        `Mission : ${roleLine(first)}`,
        ...shiftInfoText(first),
        ...noteText(d.shifts),
        ``,
        editUrl,
        ``,
        `On se réjouit de te retrouver !`,
        d.organizationName,
      ].filter(Boolean).join("\n")
    : [
        `Hello ${firstName} !`,
        ``,
        `C'est aujourd'hui ! RDV ${hoursLabel} pour le premier de tes ${d.shifts.length} créneaux de ${d.eventTitle} :`,
        ...d.shifts.flatMap(shiftBlockText),
        ...noteText(d.shifts),
        ``,
        editUrl,
        ``,
        `On se réjouit de te retrouver !`,
        d.organizationName,
      ].join("\n")

  const html = d.shifts.length === 1
    ? wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! C'est aujourd'hui 🎉</h2>
    <p style="color:#555;margin:0 0 1.25em">RDV <strong>${hoursLabel}</strong> pour <strong>${escapeHtml(d.eventTitle)}</strong> !</p>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;line-height:2">
      <div>🕐 ${escapeHtml(clockTime(first.startTime))}</div>
      <div>Mission : <strong>${escapeHtml(roleLine(first))}</strong></div>
      ${shiftInfoHtml(first)}
    </div>${noteHtml(d.shifts)}
    <p style="margin-top:1.5em">${btn(editUrl, "Voir mon inscription")}</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">On se réjouit de te retrouver !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `, `${roleLine(first)} · RDV ${hoursLabel}${first.locationDetails ? ` à ${first.locationDetails}` : ""}`)
    : wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! C'est aujourd'hui 🎉</h2>
    <p style="color:#555;margin:0 0 0.5em">RDV <strong>${hoursLabel}</strong> pour le premier de tes <strong>${d.shifts.length} créneaux</strong> de <strong>${escapeHtml(d.eventTitle)}</strong> :</p>
    <ul style="list-style:none;margin:0;padding:14px 16px;background:#f9fafb;border-radius:10px">
      ${d.shifts.map(shiftBlockHtml).join("")}
    </ul>${noteHtml(d.shifts)}
    <p style="margin-top:1.5em">${btn(editUrl, "Voir mes inscriptions")}</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">On se réjouit de te retrouver !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `, `${d.shifts.length} créneaux aujourd'hui, RDV ${hoursLabel}`)

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
    <p style="color:#666;font-size:0.85em;margin-top:2em">Un grand M E R C I, une grosse bise et à très vite !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
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
    <p style="color:#666;font-size:0.85em;margin-top:2em">À très vite !<br><strong>${escapeHtml(d.organizationName)}</strong></p>
  `, preheader)

  return { subject, html, text }
}
