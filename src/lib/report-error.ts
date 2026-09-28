import * as Sentry from "@sentry/nextjs"

/**
 * For secondary work a route deliberately doesn't fail on (a follow-up email, a waitlist
 * promotion after a cancellation, cleanup of a dead push subscription): the request still
 * succeeds, but the failure is logged and reported to Sentry instead of being swallowed by
 * `.catch(() => {})`, which left inconsistent state (e.g. a freed spot never offered) with no
 * signal. `context` names what failed; it must not contain personal data.
 *
 *   await promoteNextInWaitlist(shiftId).catch(reportError("waitlist.promote"))
 */
export function reportError(context: string) {
  return (error: unknown): void => {
    console.error(`[${context}]`, error)
    Sentry.captureException(error, { tags: { context } })
  }
}
