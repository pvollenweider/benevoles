// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "@/lib/prisma"
import { logOperator } from "@/lib/operator-log"
import { BETA_CAPABILITIES, BETA_SETTING_KEY, betaAdoptionAllowed, capabilityChanges, parseOpenCapabilities, storedOpenList, type BetaCapabilityId } from "@/lib/beta-capabilities"

/**
 * The single server entry point of the beta gate (#1168): routes, background jobs and pages call
 * `canAdoptBeta` and nothing else to decide whether a capability may be adopted. Thin loaders
 * around the pure rules of beta-capabilities.ts, which carry the contract: this gates NEW
 * adoptions only, never what an event already uses. Server only (Prisma).
 */

type SettingReader = { platformSetting: { findUnique(args: { where: { key: string }; select: { value: true } }): Promise<{ value: unknown } | null> } }

type OrgReader = {
  organization: {
    findUnique(args: { where: { id: string }; select: { active: true; suspendedAt: true; betaOptInAt: true } }): Promise<{ active: boolean; suspendedAt: Date | null; betaOptInAt: Date | null } | null>
  }
}

/** The capabilities the operator opened for trial (shipped and known ones only). */
export async function readOpenBetaCapabilities(db: SettingReader = prisma): Promise<BetaCapabilityId[]> {
  const row = await db.platformSetting.findUnique({ where: { key: BETA_SETTING_KEY }, select: { value: true } })
  return parseOpenCapabilities(row?.value)
}

/**
 * Whether `organizationId` may adopt `capabilityId` now. Pass the transaction client when the
 * adoption is written in a transaction, so the check and the write see the same state.
 */
export async function canAdoptBeta(organizationId: string, capabilityId: BetaCapabilityId, db: SettingReader & OrgReader = prisma): Promise<boolean> {
  const [open, org] = await Promise.all([
    readOpenBetaCapabilities(db),
    db.organization.findUnique({ where: { id: organizationId }, select: { active: true, suspendedAt: true, betaOptInAt: true } }),
  ])
  return betaAdoptionAllowed(org, open, capabilityId)
}

/**
 * The operator replaces the open list (« Fonctions bêta »). Each capability opened or closed is
 * logged with its author. Closing only stops new adoptions: no event, no organisation changes.
 */
export async function setOpenBetaCapabilities(open: BetaCapabilityId[], actor: { id?: string | null; name?: string | null; email?: string | null } | undefined): Promise<BetaCapabilityId[]> {
  return prisma.$transaction(async (tx) => {
    const stored = (await tx.platformSetting.findUnique({ where: { key: BETA_SETTING_KEY }, select: { value: true } }))?.value
    const before = parseOpenCapabilities(stored)
    const { opened, closed } = capabilityChanges(before, open)
    if (opened.length === 0 && closed.length === 0) return before
    // Ids this version cannot manage (written by a newer version during a deploy, or not shipped
    // here) are kept as they are: only the ones on this screen change.
    const value = { open: storedOpenList(open, stored) }
    await tx.platformSetting.upsert({
      where: { key: BETA_SETTING_KEY },
      create: { key: BETA_SETTING_KEY, value, updatedById: actor?.id ?? null },
      update: { value, updatedById: actor?.id ?? null },
    })
    for (const id of opened) {
      await logOperator(tx, { action: "beta.capability_opened", actor, entityType: "Platform", entityId: BETA_SETTING_KEY, target: BETA_CAPABILITIES[id].label })
    }
    for (const id of closed) {
      await logOperator(tx, { action: "beta.capability_closed", actor, entityType: "Platform", entityId: BETA_SETTING_KEY, target: BETA_CAPABILITIES[id].label })
    }
    return open
  })
}
