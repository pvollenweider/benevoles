import { createCipheriv, createDecipheriv, randomBytes } from "crypto"
import { hashToken } from "./token-hash"

/**
 * Storage of volunteer-facing access tokens (#290): Registration.editToken, SectorLeader.token,
 * MemberInvite.token. These links are re-sent by the app (reminders, "renvoyer le lien", leader
 * notifications, invite reminders), so they can't be one-way hashed like the admin tokens
 * (#278); instead each is stored as
 *   - `…Hash`: SHA-256 of the token, for lookups (the token is random, no salt needed);
 *   - `…Enc`:  AES-256-GCM encryption with TOKEN_ENCRYPTION_KEY, to re-send the link;
 *   - `…Legacy`: the clear text, only while no key is configured (and for rows created before
 *     one was), emptied by `encryptLegacyTokens` in the cleanup cron.
 * A DB dump or backup alone then yields no usable link: the key lives in the k8s secret only.
 *
 * Losing the key makes every encrypted token unrecoverable for re-sending (links already in
 * inboxes still work: lookups only need the hash). Keep it with the other production secrets.
 */

const VERSION = "v1"

/** 32-byte key from TOKEN_ENCRYPTION_KEY (base64), or null when not configured. */
export function encryptionKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw) return null
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded")
  return key
}

export function encryptToken(token: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":")
}

export function decryptToken(stored: string, key: Buffer): string {
  const [version, iv, tag, ciphertext] = stored.split(":")
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error("Unrecognized encrypted token format")
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8")
}

/** Columns to write for a new token: hash always, then encrypted or clear depending on the key. */
export function sealToken(token: string): { hash: string; enc: string | null; legacy: string | null } {
  const key = encryptionKey()
  return { hash: hashToken(token), enc: key ? encryptToken(token, key) : null, legacy: key ? null : token }
}

/** The clear token, to put in a link again. */
export function revealToken(row: { enc: string | null; legacy: string | null }): string {
  if (row.enc) {
    const key = encryptionKey()
    if (!key) throw new Error("Encrypted token but TOKEN_ENCRYPTION_KEY is not set")
    return decryptToken(row.enc, key)
  }
  if (row.legacy) return row.legacy
  throw new Error("Token has neither an encrypted nor a legacy value")
}

// Per-model adapters: the column names differ (editToken… on Registration, token… elsewhere).

export const registrationToken = {
  data: (token: string) => {
    const s = sealToken(token)
    return { editTokenHash: s.hash, editTokenEnc: s.enc, editTokenLegacy: s.legacy }
  },
  where: (token: string) => ({ editTokenHash: hashToken(token) }),
  select: { editTokenEnc: true, editTokenLegacy: true } as const,
  reveal: (r: { editTokenEnc: string | null; editTokenLegacy: string | null }) =>
    revealToken({ enc: r.editTokenEnc, legacy: r.editTokenLegacy }),
}

export const linkToken = {
  data: (token: string) => {
    const s = sealToken(token)
    return { tokenHash: s.hash, tokenEnc: s.enc, tokenLegacy: s.legacy }
  },
  where: (token: string) => ({ tokenHash: hashToken(token) }),
  select: { tokenEnc: true, tokenLegacy: true } as const,
  reveal: (r: { tokenEnc: string | null; tokenLegacy: string | null }) => revealToken({ enc: r.tokenEnc, legacy: r.tokenLegacy }),
}
