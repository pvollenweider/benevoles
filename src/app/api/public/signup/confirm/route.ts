// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { signupOpen, SIGNUP_CLOSED_MESSAGE } from "@/lib/signup"
import { confirmSignupRequest } from "@/lib/signup-server"

const MESSAGES = {
  unknown: "Ce lien de confirmation n'est pas valable. Refaites une demande depuis la page d'inscription.",
  expired: "Ce lien de confirmation a expiré (24 heures). Refaites une demande depuis la page d'inscription.",
  used: "Cette demande est déjà confirmée. Si vous n'avez pas encore choisi votre mot de passe, utilisez le lien reçu après la confirmation, ou « Mot de passe oublié » une fois votre compte activé.",
  taken: "Un compte existe déjà avec cette adresse. Connectez-vous, ou utilisez « Mot de passe oublié ».",
} as const

/**
 * The « Confirmer » button of the confirmation page (#810, part 4b), never the link itself: mail
 * scanners open links. Creates the organisation awaiting validation and its owner account, then
 * hands back the account activation link (choose a password).
 */
export async function POST(req: Request) {
  if (!signupOpen()) return NextResponse.json({ error: SIGNUP_CLOSED_MESSAGE, code: "signup_closed" }, { status: 403 })
  const rl = await rateLimit(getClientIp(req), "signup-confirm", 20, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop d'essais. Réessayez dans une heure." }, { status: 429 })

  const body = await req.json().catch(() => null) as { token?: unknown } | null
  const token = typeof body?.token === "string" ? body.token : ""
  if (!token) return NextResponse.json({ error: MESSAGES.unknown, code: "unknown" }, { status: 400 })

  const result = await confirmSignupRequest(token)
  if (!result.ok) return NextResponse.json({ error: MESSAGES[result.reason], code: result.reason }, { status: result.reason === "unknown" ? 404 : 409 })
  return NextResponse.json({ ok: true, inviteUrl: result.inviteUrl })
}
