import { prisma } from "./prisma"
import { encryptToken, encryptionKey } from "./token-vault"

/**
 * Encrypts the clear-text tokens left in the `…Legacy` columns (rows created before
 * TOKEN_ENCRYPTION_KEY was configured) and empties them (#290). Run by the daily cleanup cron,
 * so enabling encryption only takes setting the secret: no manual migration step. No-op without
 * a key. Each row is updated only if its legacy value is still the one read, so a concurrent
 * run can't double-encrypt or lose a token.
 */
export async function encryptLegacyTokens(opts: { batchSize?: number; maxBatches?: number } = {}) {
  const key = encryptionKey()
  if (!key) return { enabled: false as const }
  const batchSize = opts.batchSize ?? 500
  const maxBatches = opts.maxBatches ?? 20

  const counts = { registrations: 0, sectorLeaders: 0, memberInvites: 0 }

  for (let i = 0; i < maxBatches; i++) {
    const rows = await prisma.registration.findMany({
      where: { editTokenLegacy: { not: null } },
      select: { id: true, editTokenLegacy: true },
      take: batchSize,
    })
    for (const r of rows) {
      const { count } = await prisma.registration.updateMany({
        where: { id: r.id, editTokenLegacy: r.editTokenLegacy },
        data: { editTokenEnc: encryptToken(r.editTokenLegacy!, key), editTokenLegacy: null },
      })
      counts.registrations += count
    }
    if (rows.length < batchSize) break
  }

  for (let i = 0; i < maxBatches; i++) {
    const rows = await prisma.sectorLeader.findMany({
      where: { tokenLegacy: { not: null } },
      select: { id: true, tokenLegacy: true },
      take: batchSize,
    })
    for (const r of rows) {
      const { count } = await prisma.sectorLeader.updateMany({
        where: { id: r.id, tokenLegacy: r.tokenLegacy },
        data: { tokenEnc: encryptToken(r.tokenLegacy!, key), tokenLegacy: null },
      })
      counts.sectorLeaders += count
    }
    if (rows.length < batchSize) break
  }

  for (let i = 0; i < maxBatches; i++) {
    const rows = await prisma.memberInvite.findMany({
      where: { tokenLegacy: { not: null } },
      select: { id: true, tokenLegacy: true },
      take: batchSize,
    })
    for (const r of rows) {
      const { count } = await prisma.memberInvite.updateMany({
        where: { id: r.id, tokenLegacy: r.tokenLegacy },
        data: { tokenEnc: encryptToken(r.tokenLegacy!, key), tokenLegacy: null },
      })
      counts.memberInvites += count
    }
    if (rows.length < batchSize) break
  }

  return { enabled: true as const, encrypted: counts }
}
