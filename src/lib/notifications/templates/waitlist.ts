// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Waitlist: confirmation of the place in line, offered place.
 */

import type { NotificationPayload } from "../types"
import { WAITLIST_STEPS } from "../../waitlist-copy"
import { clockTime } from "../../gantt-utils"
import { escapeHtml, btn, wrap, type RenderedEmail } from "./shared"

// ── Liste d'attente : confirmation ───────────────────────────────────────────

export function renderWaitlistConfirmation(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    volunteerName: string
    eventTitle: string
    shiftLabel: string
    shiftDate: string
    shiftStart: string
    shiftEnd: string
    waitingPosition: number
    orgSlug?: string
    eventSlug?: string
  }
  const firstName = d.volunteerName.split(" ")[0]
  const subject = `Liste d'attente — ${d.eventTitle}`
  const text = [
    `Hello ${firstName} !`,
    ``,
    `Tu es sur la liste d'attente pour le créneau "${d.shiftLabel}" (${d.shiftDate} · ${clockTime(d.shiftStart)}–${clockTime(d.shiftEnd)}).`,
    `Position : ${d.waitingPosition}`,
    ``,
    `Comment ça marche :`,
    ...WAITLIST_STEPS.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n")
  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! 🕐</h2>
    <p style="color:#555;margin:0 0 1em">Tu es sur la liste d'attente pour <strong>${escapeHtml(d.eventTitle)}</strong>.</p>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;line-height:2">
      <div>📋 ${escapeHtml(d.shiftLabel)}</div>
      <div>📅 ${escapeHtml(d.shiftDate)}</div>
      <div>🕐 ${escapeHtml(clockTime(d.shiftStart))}–${escapeHtml(clockTime(d.shiftEnd))}</div>
      <div>Position : <strong>#${d.waitingPosition}</strong></div>
    </div>
    <h3 style="margin:1.25em 0 0.25em;font-size:1em">Comment ça marche</h3>
    <ol style="color:#555;margin:0;padding-left:1.25em;line-height:1.6">${WAITLIST_STEPS.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
  `, `Tu es en position #${d.waitingPosition} — on te prévient dès qu'une place se libère.`)
  return { subject, html, text }
}

// ── Liste d'attente : place proposée ─────────────────────────────────────────

export function renderWaitlistOffered(p: NotificationPayload): RenderedEmail {
  const d = p.data as {
    volunteerName: string
    eventTitle: string
    shiftLabel: string
    shiftDate: string
    shiftStart: string
    shiftEnd: string
    confirmUrl: string
    expiresAt: string // human-readable
  }
  const firstName = d.volunteerName.split(" ")[0]
  const subject = `🎉 Une place s'est libérée — ${d.eventTitle}`
  const text = [
    `Hello ${firstName} !`,
    ``,
    `Bonne nouvelle : une place s'est libérée pour "${d.shiftLabel}" (${d.shiftDate} · ${clockTime(d.shiftStart)}–${clockTime(d.shiftEnd)}) !`,
    ``,
    `Confirme ta participation avant le ${d.expiresAt} :`,
    d.confirmUrl,
    ``,
    `Passé ce délai, la place sera proposée à la personne suivante.`,
  ].join("\n")
  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(firstName)} ! 🎉</h2>
    <p style="color:#555;margin:0 0 1em">Bonne nouvelle : une place s'est libérée pour <strong>${escapeHtml(d.shiftLabel)}</strong> lors de <strong>${escapeHtml(d.eventTitle)}</strong> !</p>
    <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;line-height:2;margin-bottom:1.25em">
      <div>📅 ${escapeHtml(d.shiftDate)}</div>
      <div>🕐 ${escapeHtml(clockTime(d.shiftStart))}–${escapeHtml(clockTime(d.shiftEnd))}</div>
    </div>
    <p style="margin-top:1.5em">${btn(d.confirmUrl, "Confirmer ma participation")}</p>
    <p style="color:#b91c1c;font-size:0.85em;margin-top:1em">⏱ Ce lien expire le <strong>${escapeHtml(d.expiresAt)}</strong>. Passé ce délai, la place sera proposée à quelqu'un d'autre.</p>
  `, `Une place s'est libérée ! Confirme avant le ${d.expiresAt}.`)
  return { subject, html, text }
}
