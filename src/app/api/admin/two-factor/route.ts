// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { unstable_update } from "@/auth"
import { requireSecondFactorStep, SIGN_IN_AGAIN_ERROR } from "@/lib/second-factor-guard"
import { beginSecondFactorAttempt, confirmEnrolment, secondFactorStatus, SecondFactorUnavailableError, verifySecondFactor, type CodeOutcome } from "@/lib/second-factor-server"
import { passwordRecentEnough } from "@/lib/second-factor-session"
import { createSecondFactorProof } from "@/lib/second-factor-proof"
import { PROOF_FIELD } from "@/lib/second-factor-update"
import { SECOND_FACTOR_MESSAGES } from "@/lib/second-factor-copy"
import { getClientIp } from "@/lib/rate-limit"
import { reportError } from "@/lib/report-error"

/**
 * The second step of a super admin's sign-in (pentest F6), for the session that passed the
 * password: confirms an enrolment (first code from the app, answers the recovery codes once) or
 * checks a code of the app or a recovery code. On success the session is completed through
 * next-auth's update, with a proof only the server can make (src/lib/second-factor-proof.ts).
 *
 * Not organisation-scoped: it only ever reads and writes the signed-in account's own row.
 */

const schema = z.union([
  z.object({ code: z.string().max(20) }).strict(),
  z.object({ recoveryCode: z.string().max(40) }).strict(),
])

const NO_STORE = { "Cache-Control": "no-store" }

function refused(outcome: Extract<CodeOutcome, { ok: false }>) {
  const error = outcome.reason === "expired" ? SECOND_FACTOR_MESSAGES.enrolmentExpired
    : outcome.reason === "already_enrolled" ? SECOND_FACTOR_MESSAGES.alreadyEnrolled
      : SECOND_FACTOR_MESSAGES.invalidCode
  return NextResponse.json({ error, code: outcome.reason }, { status: 400, headers: NO_STORE })
}

export async function POST(req: Request) {
  const step = await requireSecondFactorStep()
  if (step instanceof NextResponse) return step

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: SECOND_FACTOR_MESSAGES.invalidCode }, { status: 400 })

  const now = Date.now()
  const status = await secondFactorStatus(step.account.id)
  // Enrolling needs a password checked minutes ago: whoever holds an old session can't enrol.
  if (!status.enrolled && !passwordRecentEnough(step.authAt, now)) {
    return NextResponse.json({ error: SIGN_IN_AGAIN_ERROR, code: "SIGN_IN_AGAIN" }, { status: 401 })
  }
  if (!status.enrolled && !("code" in parsed.data)) return NextResponse.json({ error: SECOND_FACTOR_MESSAGES.invalidCode }, { status: 400 })

  const attempt = await beginSecondFactorAttempt(step.account.id, getClientIp(req))
  if (!attempt.allowed) return NextResponse.json({ error: SECOND_FACTOR_MESSAGES.tooManyAttempts }, { status: 429 })

  let outcome: CodeOutcome
  try {
    outcome = status.enrolled
      ? await verifySecondFactor(step.account, parsed.data, now)
      : await confirmEnrolment(step.account, (parsed.data as { code: string }).code, now)
  } catch (e) {
    if (e instanceof SecondFactorUnavailableError) return NextResponse.json({ error: SECOND_FACTOR_MESSAGES.unavailable }, { status: 503 })
    throw e
  }
  if (!outcome.ok) return refused(outcome)
  await attempt.succeeded()

  const proof = createSecondFactorProof({ sub: step.account.id, sessionVersion: step.account.sessionVersion, loginNonce: step.loginNonce }, now, process.env.AUTH_SECRET ?? "")
  const updated = (await unstable_update({ [PROOF_FIELD]: proof } as never)) as { secondFactor?: { pending?: boolean } } | null
  if (!updated || updated.secondFactor?.pending !== false) {
    reportError("second_factor.session_update")(new Error("The session was not completed after a valid second factor"))
    return NextResponse.json({ error: SECOND_FACTOR_MESSAGES.sessionNotUpdated }, { status: 500, headers: NO_STORE })
  }
  return NextResponse.json({ ok: true, recoveryCodes: outcome.recoveryCodes ?? null, usedRecoveryCode: outcome.usedRecoveryCode ?? false }, { headers: NO_STORE })
}
