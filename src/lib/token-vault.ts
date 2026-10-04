// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

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
 *
 * Rotating the key does NOT revoke a link: a lookup only needs the row's hash to still match, and
 * rotation re-encrypts the `…Enc` column without touching it. After a leak, bulk-invalidate
 * instead with `regenerateLinks` (src/lib/link-regeneration.ts, #542), which gives every targeted
 * row a brand new token.
 */

/**
 * Keys (#313). The current key encrypts; previous keys only decrypt, so the key can be rotated:
 *   TOKEN_ENCRYPTION_KEY        current key, 32 bytes base64
 *   TOKEN_ENCRYPTION_KEY_ID     its id, stored in every value it encrypts (default "k1")
 *   TOKEN_ENCRYPTION_PREVIOUS_KEYS  "id:base64,id:base64" — keys still needed to read old values
 * Values are "v2:<keyId>:<iv>:<tag>:<ciphertext>". "v1:<iv>:<tag>:<ciphertext>" (before key ids)
 * is still read, by trying each known key (GCM authentication rejects the wrong ones).
 * Rotation: set the new key + id, move the old one to PREVIOUS_KEYS, deploy; the cleanup cron
 * re-encrypts everything with the new key (`reencryptTokens`); once it reports nothing left,
 * drop the old key.
 */
type Keyring = { current: { id: string; key: Buffer } | null; byId: Map<string, Buffer> }

function decodeKey(raw: string, name: string): Buffer {
  const key = Buffer.from(raw.trim(), "base64")
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes, base64-encoded`)
  return key
}

export function keyring(env: Record<string, string | undefined> = process.env): Keyring {
  const byId = new Map<string, Buffer>()
  for (const entry of (env.TOKEN_ENCRYPTION_PREVIOUS_KEYS ?? "").split(",").map((e) => e.trim()).filter(Boolean)) {
    const sep = entry.indexOf(":")
    if (sep <= 0) throw new Error("TOKEN_ENCRYPTION_PREVIOUS_KEYS entries must be id:base64key")
    byId.set(entry.slice(0, sep), decodeKey(entry.slice(sep + 1), "TOKEN_ENCRYPTION_PREVIOUS_KEYS"))
  }
  const raw = env.TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw) return { current: null, byId }
  const id = env.TOKEN_ENCRYPTION_KEY_ID?.trim() || "k1"
  if (id.includes(":")) throw new Error("TOKEN_ENCRYPTION_KEY_ID can't contain ':'")
  const current = { id, key: decodeKey(raw, "TOKEN_ENCRYPTION_KEY") }
  byId.set(id, current.key)
  return { current, byId }
}

/** 32-byte current key, or null when not configured. */
export function encryptionKey(): Buffer | null {
  return keyring().current?.key ?? null
}

/** AES-256-GCM, fresh IV. With a key id: "v2:<id>:…"; without (tests, legacy): "v1:…". */
export function encryptToken(token: string, key: Buffer, keyId?: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  const body = [iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")]
  return keyId ? ["v2", keyId, ...body].join(":") : ["v1", ...body].join(":")
}

function decryptBody(iv: string, tag: string, ciphertext: string, key: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8")
}

/** Decrypts with one given key (either format). */
export function decryptToken(stored: string, key: Buffer): string {
  const parts = stored.split(":")
  if (parts[0] === "v2" && parts.length === 5) return decryptBody(parts[2], parts[3], parts[4], key)
  if (parts[0] === "v1" && parts.length === 4) return decryptBody(parts[1], parts[2], parts[3], key)
  throw new Error("Unrecognized encrypted token format")
}

/** Encrypts with the current key (v2). Null without a key. */
export function encryptValue(text: string, ring: Keyring = keyring()): string | null {
  return ring.current ? encryptToken(text, ring.current.key, ring.current.id) : null
}

/** Decrypts with whichever known key the value was encrypted with. */
export function decryptValue(stored: string, ring: Keyring = keyring()): string {
  const parts = stored.split(":")
  if (parts[0] === "v2") {
    const key = ring.byId.get(parts[1])
    if (!key) throw new Error(`Encrypted with key "${parts[1]}", which isn't configured (TOKEN_ENCRYPTION_KEY / TOKEN_ENCRYPTION_PREVIOUS_KEYS)`)
    return decryptToken(stored, key)
  }
  if (parts[0] === "v1") {
    for (const key of ring.byId.values()) {
      try { return decryptToken(stored, key) } catch { /* not this key */ }
    }
    throw new Error("No configured key decrypts this value (TOKEN_ENCRYPTION_KEY / TOKEN_ENCRYPTION_PREVIOUS_KEYS)")
  }
  throw new Error("Unrecognized encrypted token format")
}

/** Whether a stored value isn't encrypted with the current key yet (old key or v1). */
export function needsReencryption(stored: string, ring: Keyring = keyring()): boolean {
  return !!ring.current && !stored.startsWith(`v2:${ring.current.id}:`)
}

/** Columns to write for a new token: hash always, then encrypted or clear depending on the key. */
export function sealToken(token: string): { hash: string; enc: string | null; legacy: string | null } {
  const enc = encryptValue(token)
  return { hash: hashToken(token), enc, legacy: enc ? null : token }
}

/** The clear token, to put in a link again. */
export function revealToken(row: { enc: string | null; legacy: string | null }): string {
  if (row.enc) return decryptValue(row.enc)
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
