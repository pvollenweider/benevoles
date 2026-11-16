// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { auth } from "@/auth"
import { prisma } from "./prisma"
import { requiresSecondFactor } from "./second-factor-session"
import type { SecondFactorAccount } from "./second-factor-server"

/** Answer of an admin API called by a session whose second factor is still to be given. */
export const SECOND_FACTOR_REQUIRED_ERROR = "Double authentification requise : saisissez d'abord le code de votre application."
export const SIGN_IN_AGAIN_ERROR = "Votre session a expiré. Reconnectez-vous avec votre mot de passe."

export function secondFactorRequired(): NextResponse {
  return NextResponse.json({ error: SECOND_FACTOR_REQUIRED_ERROR, code: "SECOND_FACTOR_REQUIRED" }, { status: 401 })
}

export type SecondFactorStep = { session: Session; account: SecondFactorAccount; loginNonce: string; authAt: number | null }

/**
 * The session of the second step (the two-factor page and its API): signed in with the password,
 * second factor still pending. Role and organization are masked in such a session, so the account is
 * read again from the database: an active account whose role requires the factor. A session without
 * a sign-in nonce (issued before the second factor existed) must sign in again first.
 */
export async function requireSecondFactorStep(): Promise<SecondFactorStep | NextResponse> {
  const session = await auth()
  const id = session?.user?.id
  if (!session || !id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 })
  if (!session.secondFactor?.pending) return NextResponse.json({ error: "La vérification est déjà faite pour cette session." }, { status: 409 })
  const account = await prisma.adminUser.findUnique({ where: { id }, select: { id: true, email: true, role: true, sessionVersion: true, isActive: true } })
  if (!account || !account.isActive || !requiresSecondFactor(account.role)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 })
  const loginNonce = session.secondFactor.loginNonce
  if (!loginNonce) return NextResponse.json({ error: SIGN_IN_AGAIN_ERROR, code: "SIGN_IN_AGAIN" }, { status: 401 })
  return { session, account, loginNonce, authAt: session.secondFactor.authAt }
}
