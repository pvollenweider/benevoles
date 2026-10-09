// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHmac } from "node:crypto"

/**
 * Block list of the self-service sign-up (#810, part 5). Three levels:
 * - an **email address**: targeted, rarely a problem;
 * - a **domain**: exceptional; a common mail provider asks for an explicit confirmation, since
 *   blocking it shuts out every legitimate person using it;
 * - an **IP address**: always temporary (shared addresses: a school, a café, a mobile operator),
 *   stored only as a keyed hash, never in clear.
 * Every entry has a reason. A blocked sign-up gets the same answer as any other and stores
 * nothing (src/app/api/public/signup/route.ts): the form never tells it was blocked.
 *
 * Pure (crypto only): validation, normalisation, matching.
 */

export type BlockKind = "email" | "domain" | "ip"

export const REASON_MIN = 3
export const REASON_MAX = 300
export const IP_DEFAULT_DAYS = 7
export const IP_MAX_DAYS = 90

/** Domains shared by many people: blocking one needs an explicit confirmation. */
export const COMMON_PROVIDERS: readonly string[] = [
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.fr", "live.com", "live.fr", "msn.com",
  "yahoo.com", "yahoo.fr", "icloud.com", "me.com", "proton.me", "protonmail.com", "gmx.ch", "gmx.fr", "gmx.de", "gmx.net",
  "bluewin.ch", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "laposte.net", "hispeed.ch", "sunrise.ch",
]

/** An IP as a key: HMAC with the application secret, so a dump of the table yields no address. */
export function ipKey(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip.trim().toLowerCase()).digest("hex")
}

/** The last characters of an IP, for the super admin's list (never the whole address). */
export function ipLabel(ip: string): string {
  const t = ip.trim()
  return `IP …${t.slice(-4)}`
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOMAIN = /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const IPV6 = /^[0-9a-f:]{2,39}$/i

export type BlockInput = { kind: unknown; value: unknown; reason: unknown; days?: unknown; confirmCommonProvider?: unknown }

export type NewBlock = { kind: BlockKind; value: string; label: string; reason: string; expiresAt: Date | null }

export type BlockValidation = { ok: true; block: NewBlock } | { ok: false; error: string; field: "kind" | "value" | "reason" | "days"; needsConfirmation?: true }

/** Checks and normalises a new entry; the IP is turned into its key here. */
export function validateBlock(input: BlockInput, secret: string, now: Date = new Date()): BlockValidation {
  const kind = input.kind
  if (kind !== "email" && kind !== "domain" && kind !== "ip") return { ok: false, error: "Choisissez ce qui est bloqué : une adresse, un domaine ou une adresse IP.", field: "kind" }
  const raw = typeof input.value === "string" ? input.value.trim().toLowerCase() : ""
  const reason = typeof input.reason === "string" ? input.reason.trim() : ""
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) return { ok: false, error: `Indiquez la raison du blocage (${REASON_MIN} à ${REASON_MAX} caractères).`, field: "reason" }

  if (kind === "email") {
    if (!EMAIL.test(raw)) return { ok: false, error: "Indiquez une adresse email complète, par exemple nom@exemple.org.", field: "value" }
    return { ok: true, block: { kind, value: raw, label: raw, reason, expiresAt: null } }
  }
  if (kind === "domain") {
    const domain = raw.replace(/^@/, "")
    if (!DOMAIN.test(domain)) return { ok: false, error: "Indiquez un nom de domaine, par exemple exemple.org.", field: "value" }
    if (COMMON_PROVIDERS.includes(domain) && input.confirmCommonProvider !== true) {
      return { ok: false, error: `${domain} est utilisé par beaucoup de personnes : le bloquer empêche toutes de s'inscrire. Cochez la confirmation pour le bloquer quand même.`, field: "value", needsConfirmation: true }
    }
    return { ok: true, block: { kind, value: domain, label: domain, reason, expiresAt: null } }
  }
  if (!IPV4.test(raw) && !(raw.includes(":") && IPV6.test(raw))) return { ok: false, error: "Indiquez une adresse IP, par exemple 203.0.113.7.", field: "value" }
  const days = input.days === undefined || input.days === "" ? IP_DEFAULT_DAYS : Number(input.days)
  if (!Number.isInteger(days) || days < 1 || days > IP_MAX_DAYS) return { ok: false, error: `Une adresse IP se bloque de 1 à ${IP_MAX_DAYS} jours.`, field: "days" }
  return { ok: true, block: { kind, value: ipKey(raw, secret), label: ipLabel(raw), reason, expiresAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000) } }
}

/** The values a sign-up is checked against: its address, its domain, its IP's key. */
export function signupKeys(email: string, ip: string | null, secret: string): { kind: BlockKind; value: string }[] {
  const address = email.trim().toLowerCase()
  const keys: { kind: BlockKind; value: string }[] = [{ kind: "email", value: address }]
  const at = address.lastIndexOf("@")
  if (at > 0) keys.push({ kind: "domain", value: address.slice(at + 1) })
  if (ip) keys.push({ kind: "ip", value: ipKey(ip, secret) })
  return keys
}

/** Whether an entry still applies: an expired IP entry no longer blocks. */
export function blockApplies(block: { expiresAt: Date | null }, now: Date): boolean {
  return !block.expiresAt || block.expiresAt.getTime() > now.getTime()
}
