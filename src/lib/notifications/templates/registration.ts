// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Volunteer registration lifecycle: confirmation, request on approval and its refusal,
 * cancellation, removal from a shift by the organization, change or cancellation of a shift,
 * personal link resent.
 */

import { confirmationVariables, fillVariables } from "../../message-variables"
import { renderMarkdown } from "../../markdown"
import { dayLabel, spokenShift } from "../../spoken-time"
import type { NotificationPayload } from "../types"
import { eventPublicUrl } from "@/lib/urls"
import { clockTime } from "../../gantt-utils"
import { shiftInfoText, type ShiftInfo } from "../../shift-info"
import { myPageUrl, escapeHtml, shiftInfoHtml, btn, wrap, type RenderedEmail } from "./shared"

/** « samedi 10 octobre » from the « 10/10/2026 » the senders format, for {date} mid-sentence; as given otherwise. */
function spokenDay(date: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date)
  if (!m) return date
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  return dayLabel(iso).toLocaleLowerCase("fr")
}

// ── Inscription confirmée ────────────────────────────────────────────────────

export function renderConfirmation(p: NotificationPayload): RenderedEmail {
  const { volunteerName, eventTitle, shifts, editToken, orgSlug, confirmationMessage } = p.data as {
    volunteerName: string
    eventTitle: string
    shifts: ({ label: string; date: string; startTime: string; endTime: string } & ShiftInfo)[]
    editToken: string
    orgSlug?: string
    confirmationMessage?: string
  }
  const editUrl = myPageUrl(orgSlug, editToken)
  const firstName = volunteerName.split(" ")[0]
  // The organizer's message may use {prénom}, {créneau}, {date}, {heure}: filled here as on the
  // confirmation page and the personal page, never sent raw.
  const message = confirmationMessage
    ? fillVariables(confirmationMessage, confirmationVariables(firstName, shifts[0] && { label: shifts[0].label, day: spokenDay(shifts[0].date), startTime: shifts[0].startTime }))
    : undefined
  const subject = `Inscription confirmée — ${eventTitle} 🎉`

  const text = [
    `Hello ${firstName} !`,
    ``,
    `Super, ton inscription pour ${eventTitle} est confirmée !`,
    ``,
    `Tes créneaux :`,
    ...shifts.flatMap((s) => [`  • ${s.label} · ${s.date} · ${clockTime(s.startTime)}–${clockTime(s.endTime)}`, ...shiftInfoText(s).map((l) => `      ${l}`)]),
    ``,
    ...(message ? [message, ``] : []),
    `Un empêchement ? Tu peux gérer tes inscriptions ici :`,
    editUrl,
    ``,
    `Un grand M E R C I et à très vite !`,
  ].join("\n")

  const preheader = `${shifts.length} créneau${shifts.length > 1 ? "x" : ""} confirmé${shifts.length > 1 ? "s" : ""} — on a hâte de te retrouver !`
  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! 🎉</h2>
    <p style="margin:0 0 1.25em;color:#555">Super, ton inscription pour <strong>${escapeHtml(eventTitle)}</strong> est confirmée !</p>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px">
      ${shifts.map((s) => `
        <div style="padding:6px 0;border-bottom:1px solid #e5e7eb">
          <strong style="color:#111">${escapeHtml(s.label)}</strong>
          <span style="color:#666;font-size:0.9em"> · ${escapeHtml(s.date)} · ${escapeHtml(clockTime(s.startTime))}–${escapeHtml(clockTime(s.endTime))}</span>
          ${shiftInfoHtml(s)}
        </div>`).join("")}
    </div>
    ${message ? `<div style="background:#eff6ff;border-radius:8px;padding:14px 16px;margin-top:1em;font-size:0.9em;color:#1e40af;">${renderMarkdown(message)}</div>` : ""}
    <p style="margin-top:1.5em">${btn(editUrl, "Gérer mes inscriptions")}</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">Un grand M E R C I et à très vite ! 🙌</p>
  `, preheader)

  return { subject, html, text }
}

// ── Demande d'inscription (créneau sur validation, #484) ────────────────────

export function renderRegistrationRequested(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    volunteerName: string
    eventTitle: string
    shifts: { label: string; date: string; startTime: string; endTime: string }[]
    editToken: string
    orgSlug?: string
  }
  const editUrl = myPageUrl(d.orgSlug, d.editToken)
  const firstName = d.volunteerName.split(" ")[0]
  const many = d.shifts.length > 1
  const subject = `Demande reçue — ${d.eventTitle}`

  const text = [
    `Hello ${firstName} !`,
    ``,
    `Ta demande pour ${d.eventTitle} est bien reçue. ${many ? "Ces créneaux sont" : "Ce créneau est"} sur validation : ce n'est pas encore une inscription confirmée.`,
    ``,
    ...d.shifts.map((s) => `  • ${s.label} · ${s.date} · ${clockTime(s.startTime)}–${clockTime(s.endTime)}`),
    ``,
    `La place t'est réservée le temps que l'organisation réponde. Tu recevras un email avec sa réponse.`,
    ``,
    `Pour suivre ou annuler ta demande :`,
    editUrl,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} !</h2>
    <p style="margin:0 0 1.25em;color:#555">Ta demande pour <strong>${escapeHtml(d.eventTitle)}</strong> est bien reçue. ${many ? "Ces créneaux sont" : "Ce créneau est"} <strong>sur validation</strong> : ce n'est pas encore une inscription confirmée.</p>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px">
      ${d.shifts.map((s) => `
        <div style="padding:6px 0;border-bottom:1px solid #e5e7eb">
          <strong style="color:#111">${escapeHtml(s.label)}</strong>
          <span style="color:#666;font-size:0.9em"> · ${escapeHtml(s.date)} · ${escapeHtml(clockTime(s.startTime))}–${escapeHtml(clockTime(s.endTime))}</span>
        </div>`).join("")}
    </div>
    <p style="color:#555;margin-top:1em">La place t'est réservée le temps que l'organisation réponde. Tu recevras un email avec sa réponse.</p>
    <p style="margin-top:1.5em">${btn(editUrl, "Suivre ma demande")}</p>
  `, `Demande reçue : l'organisation va te répondre.`)

  return { subject, html, text }
}

export function renderRegistrationRefused(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    volunteerName: string
    eventTitle: string
    shiftLabel: string
    note?: string | null
    orgSlug: string
    eventSlug: string
  }
  const eventUrl = eventPublicUrl(d.orgSlug, d.eventSlug)
  const firstName = d.volunteerName.split(" ")[0]
  const note = d.note?.trim()
  const subject = `Ta demande pour ${d.eventTitle}`

  // No reason unless the organizer wrote one (#484).
  const text = [
    `Hello ${firstName},`,
    ``,
    `Merci pour ta demande pour le créneau "${d.shiftLabel}" de ${d.eventTitle}. L'organisation ne peut pas la retenir cette fois-ci.`,
    ...(note ? [``, `Message de l'organisation :`, note] : []),
    ``,
    `D'autres créneaux sont peut-être ouverts :`,
    eventUrl,
    ``,
    `Merci pour ton envie de donner un coup de main !`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)},</h2>
    <p style="color:#555">Merci pour ta demande pour le créneau <strong>${escapeHtml(d.shiftLabel)}</strong> de <strong>${escapeHtml(d.eventTitle)}</strong>. L'organisation ne peut pas la retenir cette fois-ci.</p>
    ${note ? `<div style="background:#f9fafb;border-radius:8px;padding:14px 16px;margin-top:1em;font-size:0.9em;color:#333;white-space:pre-wrap"><strong>Message de l'organisation :</strong><br>${escapeHtml(note)}</div>` : ""}
    <p style="color:#555;margin-top:1em">D'autres créneaux sont peut-être ouverts :</p>
    <p style="margin-top:1.5em">${btn(eventUrl, "Voir les créneaux")}</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">Merci pour ton envie de donner un coup de main !</p>
  `, `L'organisation ne peut pas retenir ta demande cette fois-ci.`)

  return { subject, html, text }
}


// ── Retrait par l'organisation ───────────────────────────────────────────────

/**
 * The organization removed the volunteer from one or more shifts (« Retirer de leur créneau »,
 * #703): one email per person, listing every shift removed at once. `editToken` is the link of a
 * registration still live on the event, if any: the cancelled one no longer opens the personal
 * page, so without another one the email points to the event's public page instead.
 */
export function renderRegistrationRemoved(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    volunteerName: string
    eventTitle: string
    orgSlug: string
    eventSlug: string
    shifts: { roleName: string; label?: string | null; date: string; startTime: string; endTime: string }[]
    editToken?: string | null
  }
  const firstName = d.volunteerName.split(" ")[0]
  const lines = d.shifts.map((s) => spokenShift(s))
  const several = lines.length > 1
  const intro = `L'organisation de ${d.eventTitle} a annulé ton inscription ${several ? "à ces créneaux" : "à ce créneau"} :`
  const linkUrl = d.editToken ? myPageUrl(d.orgSlug, d.editToken) : eventPublicUrl(d.orgSlug, d.eventSlug)
  const next = d.editToken
    ? "Tes autres inscriptions sont toujours là. Ton lien personnel pour les voir ou les gérer :"
    : "D'autres créneaux sont peut-être encore ouverts :"
  const subject = `Inscription annulée : ${d.eventTitle}`

  const text = [
    `Hello ${firstName},`,
    ``,
    intro,
    ...lines.map((l) => `- ${l}`),
    ``,
    next,
    linkUrl,
    ``,
    `Merci pour ton engagement !`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)},</h2>
    <p style="color:#555">L'organisation de <strong>${escapeHtml(d.eventTitle)}</strong> a annulé ton inscription ${several ? "à ces créneaux" : "à ce créneau"} :</p>
    <ul style="color:#333;padding-left:1.25em;margin:0.5em 0 1em">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
    <p style="color:#555">${escapeHtml(next)}</p>
    <p style="margin-top:1.5em">${btn(linkUrl, d.editToken ? "Voir mes créneaux" : "Voir les créneaux")}</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">Merci pour ton engagement !</p>
  `, several ? `${lines.length} créneaux annulés pour ${d.eventTitle}.` : `Créneau annulé : ${lines[0] ?? d.eventTitle}.`)

  return { subject, html, text }
}

// ── Retrait fait par le bénévole depuis son lien ─────────────────────────────

/**
 * The volunteer cancelled, left a waitlist, refused an offered place or withdrew a request from
 * their personal link (#809): what changed and when, and what to do if it wasn't them. Sent with
 * the organisation's reply-to: answering reaches the organisers. No link: the one that was used
 * may be in someone else's hands, and the organisers can put things back.
 */
export function renderRegistrationWithdrawn(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    volunteerName: string
    eventTitle: string
    what: string
    when: string
    shift: { roleName: string; label?: string | null; date: string; startTime: string; endTime: string }
  }
  const firstName = d.volunteerName.split(" ")[0]
  const line = spokenShift(d.shift)
  const subject = `${d.what} : ${d.eventTitle}`
  const notYou = "Ce n'était pas toi ? Réponds à cet email pour prévenir l'organisation."

  const text = [
    `Hello ${firstName},`,
    ``,
    `${d.what}, ${d.when}, depuis ton lien personnel :`,
    `- ${d.eventTitle}, ${line}`,
    ``,
    notYou,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)},</h2>
    <p style="color:#555">${escapeHtml(d.what)}, ${escapeHtml(d.when)}, depuis ton lien personnel :</p>
    <ul style="color:#333;padding-left:1.25em;margin:0.5em 0 1em"><li><strong>${escapeHtml(d.eventTitle)}</strong>, ${escapeHtml(line)}</li></ul>
    <p style="color:#555">${escapeHtml(notYou)}</p>
  `, `${d.what} : ${d.eventTitle}.`)

  return { subject, html, text }
}

/**
 * An organiser put back a cancelled place or request (#809). Always sent: the volunteer must know
 * they hold the place again. The link opens their page, with this registration on it.
 */
export function renderRegistrationRestored(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    volunteerName: string
    eventTitle: string
    orgSlug: string
    status: "active" | "requested"
    shift: { roleName: string; label?: string | null; date: string; startTime: string; endTime: string }
    editToken: string
    newLink?: boolean
  }
  const firstName = d.volunteerName.split(" ")[0]
  const line = spokenShift(d.shift)
  const renewed = "Ton lien personnel a été renouvelé : l'ancien ne fonctionne plus. Garde celui de cet email pour toi."
  const what = d.status === "requested"
    ? `L'organisation de ${d.eventTitle} a rétabli ta demande d'inscription, qui attend sa réponse :`
    : `L'organisation de ${d.eventTitle} a rétabli ton inscription :`
  const linkUrl = myPageUrl(d.orgSlug, d.editToken)
  const subject = `${d.status === "requested" ? "Demande rétablie" : "Inscription rétablie"} : ${d.eventTitle}`
  const unwanted = "Tu ne veux plus de ce créneau ? Annule-le depuis ton lien personnel, ou réponds à cet email."

  const text = [
    `Hello ${firstName},`,
    ``,
    what,
    `- ${line}`,
    ``,
    ...(d.newLink ? [renewed, ``] : []),
    `Ton lien personnel pour voir ou gérer tes créneaux :`,
    linkUrl,
    ``,
    unwanted,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)},</h2>
    <p style="color:#555">${escapeHtml(what)}</p>
    <ul style="color:#333;padding-left:1.25em;margin:0.5em 0 1em"><li>${escapeHtml(line)}</li></ul>
    ${d.newLink ? `<p style="color:#555"><strong>${escapeHtml(renewed)}</strong></p>` : ""}
    <p style="margin-top:1.5em">${btn(linkUrl, "Voir mes créneaux")}</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">${escapeHtml(unwanted)}</p>
  `, `${d.status === "requested" ? "Demande rétablie" : "Inscription rétablie"} : ${line}.`)

  return { subject, html, text }
}

// ── Notif modification d'un shift ────────────────────────────────────────────

export function renderShiftModified(p: NotificationPayload): RenderedEmail {
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
      <div style="color:#666;text-decoration:line-through;font-size:0.9em">${escapeHtml(d.oldDate)} · ${escapeHtml(d.oldStart)}–${escapeHtml(d.oldEnd)}</div>
      <div style="font-weight:600;margin-top:4px">→ ${escapeHtml(d.newDate)} · ${escapeHtml(d.newStart)}–${escapeHtml(d.newEnd)}</div>
    </div>
    <p style="color:#555;font-size:0.9em">Si ces nouveaux horaires ne te conviennent pas, tu peux gérer ton inscription ci-dessous.</p>
    <p style="margin-top:1.5em">${btn(editUrl, "Gérer mon inscription")}</p>
  `, `Nouvel horaire : ${d.newDate} · ${d.newStart}–${d.newEnd} (était ${d.oldStart}–${d.oldEnd})`)

  return { subject, html, text }
}

// ── Notif annulation d'un shift ──────────────────────────────────────────────

export function renderShiftCancelled(p: NotificationPayload): RenderedEmail {
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
    <p style="color:#666;font-size:0.85em;margin-top:2em">Merci pour ta compréhension et toutes nos excuses pour la gêne occasionnée !</p>
  `, `Toutes nos excuses — d'autres créneaux restent peut-être disponibles.`)

  return { subject, html, text }
}

// ── Renvoi du lien de gestion ─────────────────────────────────────────────────

export function renderRegistrationLinkResend(p: NotificationPayload): RenderedEmail {
  const { volunteerName, eventTitle, orgSlug, editToken } = p.data as {
    volunteerName: string
    eventTitle: string
    orgSlug?: string
    editToken: string
  }
  const editUrl = myPageUrl(orgSlug, editToken)
  const firstName = volunteerName.split(" ")[0]
  const subject = `Ton lien pour gérer ton inscription — ${eventTitle}`

  const text = [
    `Hello ${firstName} !`,
    ``,
    `Voici ton lien personnel pour voir ou modifier ton inscription à ${eventTitle} :`,
    editUrl,
    ``,
    `À très vite !`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! 👋</h2>
    <p style="color:#555;margin:0 0 1.25em">Voici ton lien personnel pour voir ou modifier ton inscription à <strong>${escapeHtml(eventTitle)}</strong>.</p>
    <p style="margin-top:1.5em">${btn(editUrl, "Gérer mon inscription")}</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">À très vite !</p>
  `, `Ton lien pour ${escapeHtml(eventTitle)}`)

  return { subject, html, text }
}
