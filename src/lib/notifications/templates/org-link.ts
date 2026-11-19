// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The organisation-wide personal link (#1429, lot A): « J'ai perdu mon lien » and « Retrouver
 * toutes mes inscriptions » send the same one email; « Renouveler mon lien » sends the renewed
 * one. Both state the scope and the privacy rule, in « tu » (PRODUCT.md).
 */

import type { NotificationPayload } from "../types"
import { ORG_SCOPE_SENTENCE } from "@/lib/org-personal-page"
import { btn, escapeHtml, orgPersonalPageUrl, wrap, type RenderedEmail } from "./shared"

type OrgLinkData = {
  volunteerName: string
  organizationName: string
  orgSlug?: string
  orgToken: string
}

function data(p: NotificationPayload): OrgLinkData & { firstName: string; url: string; scope: string } {
  const d = p.data as OrgLinkData
  return {
    ...d,
    firstName: d.volunteerName.split(" ")[0],
    url: orgPersonalPageUrl(d.orgSlug, d.orgToken),
    scope: ORG_SCOPE_SENTENCE(d.organizationName),
  }
}

export function renderOrgPersonalLink(p: NotificationPayload): RenderedEmail {
  const d = data(p)
  const subject = `Ton lien pour toutes tes inscriptions — ${d.organizationName}`

  const text = [
    `Hello ${d.firstName} !`,
    ``,
    `Voici ton lien personnel pour toutes tes inscriptions auprès de ${d.organizationName} :`,
    d.url,
    ``,
    d.scope,
    ``,
    `Tu peux y annuler un créneau, dans les mêmes délais que sur la page de chaque événement.`,
    ``,
    `À très vite !`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(d.firstName)} ! 👋</h2>
    <p style="color:#555;margin:0 0 1.25em">Voici ton lien personnel pour toutes tes inscriptions auprès de <strong>${escapeHtml(d.organizationName)}</strong>.</p>
    <p style="margin-top:1.5em">${btn(d.url, "Voir mes inscriptions")}</p>
    <p style="color:#555;font-size:0.9em;margin-top:1.5em">${escapeHtml(d.scope)}</p>
    <p style="color:#666;font-size:0.85em;margin-top:1em">Tu peux y annuler un créneau, dans les mêmes délais que sur la page de chaque événement.</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">À très vite !</p>
  `, `Tes inscriptions auprès de ${d.organizationName}, en un seul lien.`)

  return { subject, html, text }
}

export function renderOrgPersonalLinkRenewed(p: NotificationPayload): RenderedEmail {
  const d = data(p)
  const subject = `Ton nouveau lien pour toutes tes inscriptions — ${d.organizationName}`

  const text = [
    `Hello ${d.firstName} !`,
    ``,
    `Ton lien personnel pour toutes tes inscriptions auprès de ${d.organizationName} a été renouvelé :`,
    d.url,
    ``,
    `L'ancien lien ne fonctionne plus.`,
    ``,
    d.scope,
    ``,
    `Tu peux y annuler un créneau, dans les mêmes délais que sur la page de chaque événement.`,
    ``,
    `À très vite !`,
  ].join("\n")

  const html = wrap(`
    <h2 style="margin:0 0 0.25em">Hello ${escapeHtml(d.firstName)} ! 👋</h2>
    <p style="color:#555;margin:0 0 1.25em">Ton lien personnel pour toutes tes inscriptions auprès de <strong>${escapeHtml(d.organizationName)}</strong> a été renouvelé.</p>
    <p style="margin-top:1.5em">${btn(d.url, "Voir mes inscriptions")}</p>
    <p style="color:#555;font-size:0.9em;margin-top:1em"><strong>L'ancien lien ne fonctionne plus.</strong></p>
    <p style="color:#555;font-size:0.9em;margin-top:1.5em">${escapeHtml(d.scope)}</p>
    <p style="color:#666;font-size:0.85em;margin-top:1em">Tu peux y annuler un créneau, dans les mêmes délais que sur la page de chaque événement.</p>
    <p style="color:#666;font-size:0.85em;margin-top:2em">À très vite !</p>
  `, `Ton nouveau lien pour tes inscriptions auprès de ${d.organizationName}.`)

  return { subject, html, text }
}
