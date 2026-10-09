// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { isSignupOpen } from "@/lib/signup-switch"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { reportError } from "@/lib/report-error"
import { looksAutomated, signupSchema, SIGNUP_ACCEPTED_MESSAGE, SIGNUP_CLOSED_MESSAGE } from "@/lib/signup"
import { contactEmail } from "@/lib/site"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { reportError } from "@/lib/report-error"
import { looksAutomated, signupOpen, signupSchema, SIGNUP_ACCEPTED_MESSAGE, signupClosedMessage } from "@/lib/signup"
import { createSignupRequest, signupBlocked } from "@/lib/signup-server"

/**
 * Self-service sign-up form (#810, part 4b): stores the request and emails a confirmation link.
 * Same answer whatever happens (sent, address already known, automated, too many requests), so
 * the form tells nothing about who has an account. Only a malformed field gets its own message.
 */
export async function POST(req: Request) {
  if (!(await isSignupOpen())) return NextResponse.json({ error: SIGNUP_CLOSED_MESSAGE, code: "signup_closed" }, { status: 403 })
  if (!signupOpen()) return NextResponse.json({ error: signupClosedMessage(contactEmail()), code: "signup_closed" }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = signupSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: issue?.message ?? "Formulaire incomplet.", field: issue?.path?.[0] ?? null }, { status: 400 })
  }

  const accepted = NextResponse.json({ ok: true, message: SIGNUP_ACCEPTED_MESSAGE }, { status: 202 })
  const ip = getClientIp(req)
  const rl = await rateLimit(ip, "signup", 5, 60 * 60 * 1000)
  if (!rl.ok || looksAutomated(parsed.data, Date.now())) return accepted

  try {
    // Block list (#810, part 5): the same answer, nothing stored.
    if (await signupBlocked(parsed.data.email, ip)) return accepted
    await createSignupRequest(parsed.data)
  } catch (e) {
    reportError("signup.create")(e)
    return NextResponse.json({ error: "La demande n'a pas pu être enregistrée. Réessayez dans un instant." }, { status: 500 })
  }
  return accepted
}
