// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Helpers shared by every email template: base URL, personal-page links, HTML escaping,
 * button and the HTML layout around each email.
 */

import { orgBaseUrl } from "@/lib/urls"
import { onSiteContact, shiftInfoLines, telHref, type ShiftInfo, type ShiftInfoLine } from "../../shift-info"
import { MAP_LINK_EMAIL_LABEL } from "../../map-link"

export const BASE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")

export function myPageUrl(orgSlug: string | undefined, editToken: string): string {
  const base = orgSlug ? orgBaseUrl(orgSlug) : BASE_URL
  return `${base}/my/${editToken}`
}

export function leaderPageUrl(orgSlug: string | undefined, token: string): string {
  const base = orgSlug ? orgBaseUrl(orgSlug) : BASE_URL
  return `${base}/leader/${token}`
}

/** Admin login lives on the app's own domain, not an org subdomain (#559). */
export function adminShiftUrl(eventId: string, shiftId: string): string {
  return `${BASE_URL}/admin/events/${eventId}/registrations?shift=${shiftId}`
}

export function adminStaffingUrl(eventId: string): string {
  return `${BASE_URL}/admin/events/${eventId}/staffing`
}

/** The members list, filtered on « Adresses à vérifier » (#599): same admin-domain rule as the
 * other admin links above. */
export function adminMembersToVerifyUrl(): string {
  return `${BASE_URL}/admin/members?verify=1`
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** The value of one line: the contact's number as a tappable `tel:` link (#560), the place with its map link. */
function lineHtml(l: ShiftInfoLine, info: ShiftInfo): string {
  const contact = l.kind === "contact" || l.kind === "dayContact" ? onSiteContact(info) : null
  if (contact?.phone) {
    return `${contact.name ? `${escapeHtml(contact.name)}, ` : ""}<a href="${escapeHtml(telHref(contact.phone))}">${escapeHtml(contact.phone)}</a>`
  }
  return `${escapeHtml(l.text)}${l.href ? ` : <a href="${escapeHtml(l.href)}">${MAP_LINK_EMAIL_LABEL}</a>` : ""}`
}

/** Place, contact and instructions of a shift as small lines under it (#397). */
export function shiftInfoHtml(info: ShiftInfo): string {
  const lines = shiftInfoLines(info)
  if (lines.length === 0) return ""
  return `<div style="color:#444;font-size:0.85em;margin-top:4px">${lines.map((l) => `<div>${escapeHtml(l.label)} : ${lineHtml(l, info)}</div>`).join("")}</div>`
}

export function btn(href: string, label: string): string {
  return `<a href="${href}" style="background:#2563eb;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;font-size:14px">${label}</a>`
}

// preheader = invisible text shown in inbox preview after the subject line
export function wrap(inner: string, preheader?: string): string {
  const ph = preheader
    ? `<div style="display:none;font-size:1px;color:#f5f5f5;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : ""
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,system-ui,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
${ph}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
<tr><td align="center" style="padding:32px 16px 24px;">
<!-- align="center" above only centers this table CELL on the page; text-align is inherited CSS,
     so without an explicit override here every unstyled heading/paragraph inside would inherit
     "center" too instead of reading left-aligned like normal body text. -->
<div style="max-width:560px;text-align:left;background:#ffffff;border-radius:14px;padding:36px 36px 24px;color:#111111;line-height:1.6;box-shadow:0 1px 4px rgba(0,0,0,0.07);">
${inner}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #f0f0f0;font-size:12px;color:#666;text-align:center;">
  <a href="https://benevol.app" style="color:#666;text-decoration:none;">benevol.app</a>
</div>
</div>
</td></tr>
</table>
</body>
</html>`
}

export type RenderedEmail = {
  subject: string
  html: string
  text: string
}
