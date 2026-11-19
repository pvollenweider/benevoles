// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Preview of a library template as the volunteer receives it (#1414): the same renderer as a
 * targeted message, with sample values for the variables, one sample shift and the personal link
 * (or the invitation link for the invited audience). `[à compléter : …]` is wrapped in a `<mark>`
 * in the HTML; the text itself already says what to fill in, so the highlight never relies on
 * colour alone. Pure: imported by the client dialog and by tests.
 */

import { renderVariables } from "./message-template"
import type { LibraryTemplate } from "./message-template-library"
import { renderTargetedMessage } from "./notifications/templates/reminders"
import { BASE_URL } from "./notifications/templates/shared"

export const PREVIEW_VOLUNTEER_NAME = "Léa Martin"
export const PREVIEW_FIRST_NAME = "Léa"
export const PREVIEW_EVENT = "Fête du quartier"
export const PREVIEW_ROLE = "Buvette"
export const PREVIEW_SHIFT = "Buvette · sam. 20 juin, 18h–22h"
export const PREVIEW_SHIFT_DATE = "sam. 20 juin"

const PLACEHOLDER = /\[à compléter[^\]]*\]/g

/** Text split around the `[à compléter : …]` parts, for a React renderer that marks them. */
export type PlaceholderPart = { text: string; placeholder: boolean }

export function splitPlaceholders(text: string): PlaceholderPart[] {
  const parts: PlaceholderPart[] = []
  let last = 0
  for (const match of text.matchAll(PLACEHOLDER)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ text: text.slice(last, index), placeholder: false })
    parts.push({ text: match[0], placeholder: true })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), placeholder: false })
  return parts
}

/** The rendered HTML with each `[à compléter : …]` visibly marked (inline style: the email iframe has no CSS). */
export function highlightPlaceholders(html: string): string {
  return html.replace(PLACEHOLDER, (match) => `<mark style="background:#fde68a;color:#111827;font-weight:600;padding:0 2px;border-radius:2px">${match}</mark>`)
}

/**
 * The email a volunteer would receive for this library template. `organizationName` is the real
 * one (it signs the email); the rest is sample data, clearly labelled as such in the dialog.
 */
export function renderLibraryPreview(template: LibraryTemplate, organizationName: string, previewBaseUrl = BASE_URL): { subject: string; html: string; text: string } {
  const variables = {
    prénom: PREVIEW_FIRST_NAME,
    événement: PREVIEW_EVENT,
    poste: PREVIEW_ROLE,
    créneau: PREVIEW_SHIFT,
  }
  const invited = template.audience === "invited_without_shift"
  // The sample link is built on the organisation's real host (the page hands it down from the
  // server), so the preview never shows a localhost link in production.
  const base = (previewBaseUrl || BASE_URL).replace(/\/+$/, "")
  const email = renderTargetedMessage({
    kind: "targeted_message",
    recipient: { name: PREVIEW_VOLUNTEER_NAME },
    data: {
      volunteerName: PREVIEW_VOLUNTEER_NAME,
      organizationName,
      eventTitle: PREVIEW_EVENT,
      subject: renderVariables(template.subject, variables),
      message: renderVariables(template.body, variables),
      // The shifts and the personal link are appended by the renderer; the body never repeats them.
      shifts: invited ? [] : [{ label: PREVIEW_ROLE, date: PREVIEW_SHIFT_DATE, startTime: "18:00", endTime: "22:00" }],
      editToken: invited ? undefined : "apercu",
      signupUrl: invited ? `${base}/inscription?invitation=apercu` : undefined,
    },
  })
  // renderTargetedMessage builds the personal link on BASE_URL; swap in the organisation's base.
  const withBase = (text: string) => (base === BASE_URL ? text : text.split(BASE_URL).join(base))
  return { subject: email.subject, html: highlightPlaceholders(withBase(email.html)), text: withBase(email.text) }
}
