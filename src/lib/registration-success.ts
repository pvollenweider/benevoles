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
