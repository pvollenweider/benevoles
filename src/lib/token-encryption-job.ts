// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { decryptValue, encryptValue, keyring, needsReencryption } from "./token-vault"

/**
 * Daily token maintenance, run by the cleanup cron (#290, #313). No-op without a key.
 *
 * 1. Encrypts the clear-text tokens left in the `…Legacy` columns and empties them.
 * 2. Re-encrypts with the current key whatever is still encrypted with a previous key (or in
 *    the pre-key-id v1 format), so a rotated key can be retired once this reports nothing left.
 *
 * Every row is updated only if its value is still the one read, so concurrent runs can't
 * double-process or lose a token.
 */

type Row = { id: string; value: string | null }
type Table = {
  name: "registrations" | "sectorLeaders" | "memberInvites"
  legacy?: (take: number) => Promise<Row[]>
  encrypted: (take: number, notPrefix: string) => Promise<Row[]>
  update: (id: string, from: { legacy?: string; enc?: string }, enc: string) => Promise<number>
}

const tables: Table[] = [
  {
    name: "registrations",
    legacy: (take) => prisma.registration.findMany({ where: { editTokenLegacy: { not: null } }, select: { id: true, editTokenLegacy: true }, take })
      .then((rows) => rows.map((r) => ({ id: r.id, value: r.editTokenLegacy }))),
    encrypted: (take, notPrefix) => prisma.registration.findMany({ where: { editTokenEnc: { not: null }, NOT: { editTokenEnc: { startsWith: notPrefix } } }, select: { id: true, editTokenEnc: true }, take })
      .then((rows) => rows.map((r) => ({ id: r.id, value: r.editTokenEnc }))),
    update: (id, from, enc) => prisma.registration.updateMany({
      where: { id, ...(from.legacy ? { editTokenLegacy: from.legacy } : { editTokenEnc: from.enc }) },
      data: { editTokenEnc: enc, editTokenLegacy: null },
    }).then((r) => r.count),
  },
  {
    name: "sectorLeaders",
    legacy: (take) => prisma.sectorLeader.findMany({ where: { tokenLegacy: { not: null } }, select: { id: true, tokenLegacy: true }, take })
      .then((rows) => rows.map((r) => ({ id: r.id, value: r.tokenLegacy }))),
    encrypted: (take, notPrefix) => prisma.sectorLeader.findMany({ where: { tokenEnc: { not: null }, NOT: { tokenEnc: { startsWith: notPrefix } } }, select: { id: true, tokenEnc: true }, take })
      .then((rows) => rows.map((r) => ({ id: r.id, value: r.tokenEnc }))),
    update: (id, from, enc) => prisma.sectorLeader.updateMany({
      where: { id, ...(from.legacy ? { tokenLegacy: from.legacy } : { tokenEnc: from.enc }) },
      data: { tokenEnc: enc, tokenLegacy: null },
    }).then((r) => r.count),
  },
  {
    name: "memberInvites",
    legacy: (take) => prisma.memberInvite.findMany({ where: { tokenLegacy: { not: null } }, select: { id: true, tokenLegacy: true }, take })
      .then((rows) => rows.map((r) => ({ id: r.id, value: r.tokenLegacy }))),
    encrypted: (take, notPrefix) => prisma.memberInvite.findMany({ where: { tokenEnc: { not: null }, NOT: { tokenEnc: { startsWith: notPrefix } } }, select: { id: true, tokenEnc: true }, take })
      .then((rows) => rows.map((r) => ({ id: r.id, value: r.tokenEnc }))),
    update: (id, from, enc) => prisma.memberInvite.updateMany({
      where: { id, ...(from.legacy ? { tokenLegacy: from.legacy } : { tokenEnc: from.enc }) },
      data: { tokenEnc: enc, tokenLegacy: null },
    }).then((r) => r.count),
  },
]

export async function encryptLegacyTokens(opts: { batchSize?: number; maxBatches?: number } = {}) {
  const ring = keyring()
  if (!ring.current) return { enabled: false as const }
  const batchSize = opts.batchSize ?? 500
  const maxBatches = opts.maxBatches ?? 20
  const prefix = `v2:${ring.current.id}:`

  const encrypted = { registrations: 0, sectorLeaders: 0, memberInvites: 0 }
  const reencrypted = { registrations: 0, sectorLeaders: 0, memberInvites: 0 }

  for (const t of tables) {
    const name = t.name as keyof typeof encrypted
    for (let i = 0; t.legacy && i < maxBatches; i++) {
      const rows = await t.legacy(batchSize)
      for (const r of rows) encrypted[name] += await t.update(r.id, { legacy: r.value! }, encryptValue(r.value!, ring)!)
      if (rows.length < batchSize) break
    }
    for (let i = 0; i < maxBatches; i++) {
      const rows = (await t.encrypted(batchSize, prefix)).filter((r) => r.value && needsReencryption(r.value, ring))
      for (const r of rows) {
        reencrypted[name] += await t.update(r.id, { enc: r.value! }, encryptValue(decryptValue(r.value!, ring), ring)!)
      }
      if (rows.length < batchSize) break
    }
  }

  return { enabled: true as const, keyId: ring.current.id, encrypted, reencrypted }
}
