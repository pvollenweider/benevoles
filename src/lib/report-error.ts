// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import * as Sentry from "@sentry/nextjs"
import { errorLogLine, safeErrorContext } from "@/lib/report-error-log"

/**
 * For secondary work a route deliberately doesn't fail on (a follow-up email, a waitlist
 * promotion after a cancellation, cleanup of a dead push subscription): the request still
 * succeeds, but the failure is logged and reported to Sentry instead of being swallowed by
 * `.catch(() => {})`, which left inconsistent state (e.g. a freed spot never offered) with no
 * signal. `context` names what failed (lowercase letters, digits, `_`, `.`, `-`); it must not
 * contain personal data. The log line keeps only the context, a code and the scrubbed message
 * (#1042); Sentry gets the error itself, scrubbed by its beforeSend.
 *
 *   await promoteNextInWaitlist(shiftId).catch(reportError("waitlist.promote"))
 */
export function reportError(context: string) {
  return (error: unknown): void => {
    console.error(errorLogLine(context, error))
    Sentry.captureException(error, { tags: { context: safeErrorContext(context) } })
  }
}
