// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { MAX_REMINDER_RULES } from "@/lib/reminder-rules"
import { loadEventReminderRulesState, saveEventReminderRules } from "@/lib/reminder-rules-data"

/**
 * Per-event reminder delays (#1139): GET the current mode, rules and next send; PUT replace them.
 * Its own route, not a field of the autosaved event form: saving the rules reconciles the unsent
 * occurrences under a lock, so it must be one explicit action.
 */
const ruleSchema = z.object({
  id: z.string().min(1).optional(),
  unit: z.string(),
  value: z.number(),
  enabled: z.boolean(),
}).strict()

const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("default") }).strict(),
  z.object({ mode: z.literal("custom"), rules: z.array(ruleSchema).max(MAX_REMINDER_RULES * 10) }).strict(),
])

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const state = await loadEventReminderRulesState(guard.db, guard.organizationId, id, new Date())
  if (!state) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  return NextResponse.json(state)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const index = issue?.path[0] === "rules" && typeof issue.path[1] === "number" ? issue.path[1] + 1 : undefined
    return NextResponse.json(
      {
        error: index
          ? `Rappel ${index} : indiquez un délai entier et son unité.`
          : "Indiquez s'il faut garder les délais habituels ou définir ceux de l'événement.",
        ...(index ? { rule: index } : {}),
      },
      { status: 400 },
    )
  }

  const result = await saveEventReminderRules(db, organizationId, id, parsed.data)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.rule ? { rule: result.rule } : {}) },
      { status: result.status },
    )
  }
  if (Object.keys(result.changes).length > 0) {
    await logEvent({
      eventId: id,
      actor: adminActor(guard.session),
      action: "event.updated",
      entityType: "Event",
      entityId: id,
      changes: result.changes,
    })
  }
  return NextResponse.json(result.state)
}
