// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Where a successful sign-up lands: `/<event>/success` with what the confirmation reads. Pure and
 * client-safe (no Prisma): the public event page imports it.
 *
 * The organisation of the page (`?org=`, where there is no organisation subdomain, e.g. locally)
 * always carries over: without it the confirmation of an organisation other than the default
 * one answers 404, although the sign-up went through.
 */
import { embedFlowParams } from "./embed"
import { setUpdatedParams, type SignupUpdates } from "./signup-updates"

export interface SignupResult {
  editToken?: string | null
  onWaitlist?: boolean
  requestedShifts?: number | string | null
  activeShifts?: number | string | null
  /** What a sign-up from the personal page updated (#1013), said by the confirmation. */
  updated?: SignupUpdates | null
}

export function successPath(eventSlug: string, result: SignupResult, current: URLSearchParams, embed: boolean): string {
  const params = new URLSearchParams()
  const org = current.get("org")
  if (org) params.set("org", org)
  if (result.editToken) params.set("token", result.editToken)
  if (result.onWaitlist) params.set("waitlist", "1")
  if (Number(result.requestedShifts) > 0) {
    params.set("requested", String(result.requestedShifts))
    params.set("active", String(result.activeShifts ?? 0))
  }
  setUpdatedParams(params, result.updated)
  // Embedded (#948): the frame keeps its group link, organisation and `embed=1` on the confirmation.
  if (embed) embedFlowParams(current).forEach((value, key) => params.set(key, value))
  const query = params.toString()
  return `/${eventSlug}/success${query ? `?${query}` : ""}`
}

/**
 * The confirmation's way out (#1097): back to the event, never to the organisation's home only.
 * Embedded (#948), back to the schedule in the frame with its flow; otherwise the event page with
 * the organisation of the page (`?org=`, no subdomain), nothing else of the address (the token
 * stays out).
 */
export function successBackLink(eventSlug: string, current: URLSearchParams, embed: boolean): { href: string; label: string } {
  if (embed) return { href: `/${eventSlug}?${embedFlowParams(current)}`, label: "Revenir au planning" }
  const org = current.get("org")
  return { href: `/${eventSlug}${org ? `?${new URLSearchParams({ org })}` : ""}`, label: "Revenir à l'événement" }
}

/**
 * Whether the confirmation says the personal link is in the email (#1097): when the page has no
 * link of its own to show (a public sign-up without proof of the address, #285), and always in
 * the frame (#948). Not for a waiting list only: that email carries no personal link.
 */
export function showsPersonalLinkEmailNote(o: { hasToken: boolean; embed: boolean; waitlistOnly: boolean }): boolean {
  return !o.waitlistOnly && (o.embed || !o.hasToken)
}
