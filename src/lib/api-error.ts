import { NextResponse } from "next/server"
import type { z } from "zod"
import { firstIssueMessage } from "./shift-time"

/**
 * One error shape for every API route (#320): `{ error: string, details?: unknown }`.
 * `error` is always a human-readable French message the client can show as is; `details`
 * carries structured data when useful (field errors of a validation failure).
 */

/** Message naming the invalid fields, e.g. "Données invalides (email, phone)." */
export function invalidFieldsMessage(error: z.ZodError): string {
  const fields = [...new Set(error.issues.map((i) => i.path.join(".")).filter(Boolean))]
  return fields.length ? `Données invalides (${fields.join(", ")}).` : "Données invalides."
}

/**
 * 400 for a failed zod parse. Zod's default messages are English, so the generic message names
 * the fields; `useIssueMessage` returns the first issue's own message instead, for schemas that
 * define French messages (shift times).
 */
export function validationError(error: z.ZodError, opts: { useIssueMessage?: boolean } = {}) {
  const message = opts.useIssueMessage ? firstIssueMessage(error) : invalidFieldsMessage(error)
  return NextResponse.json({ error: message, details: error.flatten() }, { status: 400 })
}
