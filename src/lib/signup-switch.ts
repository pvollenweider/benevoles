// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "@/lib/prisma"
import { signupOpen } from "@/lib/signup"
import { logOperator } from "@/lib/operator-log"

/**
 * The « Inscriptions fermées » switch of the super admin space (#810): closes the self-service
 * sign-up at once, without a deploy. `SIGNUP=off` (server configuration) still closes it too, and
 * wins: the switch cannot reopen what the configuration closed. Server only (Prisma).
 */

const KEY = "signup"

type Stored = { closed?: boolean }

export type SignupSwitchState = { open: boolean; closedBy: "config" | "operator" | null }

/** Pure: the configuration first, then the operator's switch. */
export function signupSwitchState(configOpen: boolean, closedByOperator: boolean): SignupSwitchState {
  if (!configOpen) return { open: false, closedBy: "config" }
  if (closedByOperator) return { open: false, closedBy: "operator" }
  return { open: true, closedBy: null }
}

async function closedByOperator(): Promise<boolean> {
  const row = await prisma.platformSetting.findUnique({ where: { key: KEY }, select: { value: true } })
  return (row?.value as Stored | null)?.closed === true
}

export async function readSignupSwitch(): Promise<SignupSwitchState> {
  return signupSwitchState(signupOpen(), await closedByOperator())
}

/** Whether a sign-up may be requested or confirmed right now. */
export async function isSignupOpen(): Promise<boolean> {
  return (await readSignupSwitch()).open
}

/** Closes or reopens, and logs the decision with it. */
export async function setSignupClosed(closed: boolean, actor: { id?: string | null; name?: string | null; email?: string | null } | undefined): Promise<SignupSwitchState> {
  await prisma.$transaction(async (tx) => {
    await tx.platformSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: { closed }, updatedById: actor?.id ?? null },
      update: { value: { closed }, updatedById: actor?.id ?? null },
    })
    await logOperator(tx, { action: closed ? "signup.closed" : "signup.opened", actor, entityType: "Platform", entityId: KEY, target: "Inscriptions en libre-service" })
  })
  return readSignupSwitch()
}
