// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { logEvent } from "@/lib/event-log"
import { ORG_LIFECYCLE_SELECT, orgLinksOpen } from "@/lib/org-lifecycle"
import { orgUnavailableResponse } from "@/lib/org-lifecycle-response"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { recordTokenMiss, tokenLookupsBlocked, tokenUseAllowed } from "@/lib/token-rate-limit"
import { registrationToken } from "@/lib/token-vault"
import { readWorkloadGate } from "@/lib/workload-guard"
import { readPersonalLayers, setPersonalLimits } from "@/lib/workload-personal-data"

/**
 * The link holder's own workload limits on the event (#1171, lot 2, Codex point 8): GET reads them
 * with the event's limits to compare, PUT sets them, DELETE removes them: their own layer only (the
 * organisation's stays, and the stricter of the two applies). Only while the event's protection is on. Private, never cached; same token lookup and rate limits as the personal page.
 */

const NO_STORE = { "Cache-Control": "private, no-store" }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const tooManyAttempts = () => json({ error: "Trop de tentatives." }, 429)
const notFound = () => json({ error: "Inscription introuvable ou déjà annulée." }, 404)

async function holder(token: string) {
  return prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: { in: [...LIVE_STATUSES] } },
    select: { volunteerId: true, eventId: true, event: { select: { organization: { select: ORG_LIFECYCLE_SELECT } } } },
  })
}

async function open(req: Request, token: string) {
  if (await tokenLookupsBlocked(req)) return { response: tooManyAttempts() }
  const h = await holder(token)
  if (!h) {
    await recordTokenMiss(req)
    return { response: notFound() }
  }
  if (!orgLinksOpen(h.event.organization)) return { response: orgUnavailableResponse() }
  if (!(await tokenUseAllowed(token, "limits"))) return { response: tooManyAttempts() }
  return { h }
}

async function state(eventId: string, volunteerId: string) {
  const gate = await readWorkloadGate(prisma, eventId)
  if (gate.kind !== "on") return { available: false as const }
  const layers = await readPersonalLayers(prisma, eventId, volunteerId)
  const p = gate.policy
  return {
    available: true as const,
    event: { maxContinuousMinutes: p.maxContinuousMinutes, minBreakMinutes: p.minBreakMinutes, maxDailyMinutes: p.maxDailyMinutes, maxEventMinutes: p.maxEventMinutes, minRestMinutes: p.minRestMinutes },
    // Their own limits, which they change freely, and the organisation's, which only it changes.
    mine: layers.volunteer,
    organisation: layers.admin,
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { h, response } = await open(req, token)
  if (response) return response
  return json(await state(h.eventId, h.volunteerId))
}

async function write(req: Request, params: Promise<{ token: string }>, remove: boolean) {
  const { token } = await params
  const { h, response } = await open(req, token)
  if (response) return response
  const body = remove ? null : ((await req.json().catch(() => null)) as { limits?: unknown } | null)?.limits ?? {}
  const result = await setPersonalLimits(prisma, h.eventId, h.volunteerId, body, "volunteer")
  if (!result.ok) return json({ error: result.error, problems: result.problems, workload: result.workload }, result.status)
  if (result.changed) {
    await logEvent({ eventId: h.eventId, actor: { type: "volunteer", id: h.volunteerId }, action: remove ? "workload.personal_limits_removed" : "workload.personal_limits_set", entityType: "Event", entityId: h.eventId })
  }
  return json(await state(h.eventId, h.volunteerId))
}

export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return write(req, params, false)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return write(req, params, true)
}
