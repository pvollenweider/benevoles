// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure candidate-pair detection for « possible duplicate » members (#601). No Prisma import here
 * on purpose (src/lib modules reachable from client components must stay free of it, see
 * CLAUDE.md): the loader (src/lib/member-duplicates-data.ts, server-only) hashes nothing and does
 * no database access — it just loads plain rows (and the #599 "address to verify" status already
 * computed by delivery-outcomes-data.ts) and passes them in here.
 *
 * This only ever produces suggestions, ranked by how many independent signals a pair shares.
 * Nothing here merges, deletes, or writes anything — see the issue's Precautions:
 * - same name is never presented as "same person" (homonyms, parent/child);
 * - a shared phone or a shared email ALONE is never "probably the same person" (family address,
 *   company switchboard) — worded as "numéro partagé possible" / "adresse partagée possible";
 * - wording is always "fiches peut-être en double", never a certainty.
 *
 * Blocking (for performance on a large organization): pairs are only ever compared within a
 * block of members sharing a normalized full name, a normalized phone, or an email domain +
 * local-part prefix — never all-pairs. See src/lib/__tests__/member-duplicates.test.ts for the
 * performance assertion (a few thousand generated members, well under a second).
 */

import { fold } from "./text-fold"

// ── Name normalization ──────────────────────────────────────────────────────────

/** Case, accents (via fold), spaces, hyphens and apostrophes folded away. */
function normalizeNamePart(s: string): string {
  return fold(s)
    .replace(/['’\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeFullName(firstName: string, lastName: string): string {
  const parts = `${normalizeNamePart(firstName)} ${normalizeNamePart(lastName)}`.replace(/\s+/g, " ").trim()
  return parts
}

// ── Phone normalization ──────────────────────────────────────────────────────────

/**
 * Swiss/French-leaning, deliberately simple (no new dependency, per the issue): strips everything
 * but digits and a leading "+", then folds the national-call prefixes down to a bare international
 * number (no "+", so "0041791234567" and "+41791234567" and "079 123 45 67" all normalize the
 * same). A bare national "0" prefix is assumed Swiss (this product's primary market) — this is a
 * simplification, not a full phone-parsing library. Too short to plausibly be a phone number →
 * null (never block on garbage).
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.trim().replace(/[^\d+]/g, "")
  if (!digits) return null
  if (digits.startsWith("+")) digits = digits.slice(1)
  else if (digits.startsWith("00")) digits = digits.slice(2)
  else if (digits.startsWith("0")) digits = `41${digits.slice(1)}`
  if (!/^\d{8,15}$/.test(digits)) return null
  return digits
}

// ── Email normalization / closeness ──────────────────────────────────────────────

export function normalizeEmailParts(email: string | null | undefined): { local: string; domain: string } | null {
  if (!email) return null
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf("@")
  if (at <= 0 || at === trimmed.length - 1) return null
  return { local: trimmed.slice(0, at), domain: trimmed.slice(at + 1) }
}

/** A small list of common domain typos (per the issue), not an exhaustive provider list. */
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmaill.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmil.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "bluewin.c": "bluewin.ch",
}

export function canonicalDomain(domain: string): string {
  return DOMAIN_TYPOS[domain] ?? domain
}

/** Classic Levenshtein edit distance, short strings only (email local parts) — O(n·m), fine here. */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const prev = new Array<number>(n + 1)
  const curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  return prev[n]
}

/** Very close, never identical: same domain (or a known typo of it) and local-part edit distance
 * of at most 2. Two literally identical addresses aren't a "close email" signal on their own. */
export function emailsAreClose(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = normalizeEmailParts(a)
  const pb = normalizeEmailParts(b)
  if (!pa || !pb) return false
  if (pa.local === pb.local && pa.domain === pb.domain) return false
  if (canonicalDomain(pa.domain) !== canonicalDomain(pb.domain)) return false
  return editDistance(pa.local, pb.local) <= 2
}

/** Blocking key: canonical domain + first 3 characters of the local part — coarser than
 * `emailsAreClose` on purpose (blocking only narrows candidates; `emailsAreClose` still verifies
 * every candidate pair before a signal is recorded). */
function emailBlockKey(email: string): string | null {
  const parts = normalizeEmailParts(email)
  if (!parts) return null
  return `${canonicalDomain(parts.domain)}:${parts.local.slice(0, 3)}`
}

// ── Pairs ─────────────────────────────────────────────────────────────────────

export type SignalKind = "name" | "phone" | "email" | "address_to_verify" | "birth_date"

export interface DuplicateMemberInput {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  birthDate: Date | null
  active: boolean
  /** The member's current address needs checking (#599) — delivery-outcomes-data.ts's addressStatus. */
  addressToVerify: boolean
  /** A tombstone (already absorbed into another record, #600) — never suggested, see refuseMerge
   * in member-merge.ts and this module's own filtering below. */
  mergedIntoId: string | null
}

export interface DuplicatePair {
  memberIdA: string
  memberIdB: string
  /** Sorted, for a stable fingerprint and stable tests. */
  signals: SignalKind[]
  /** Ranking only — never shown as a probability or exposed as a merge trigger. */
  score: number
  /** Worded reasons, in French, following the issue's wording rules. */
  reasons: string[]
}

function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}\u0000${idB}` : `${idB}\u0000${idA}`
}

function addSignal(map: Map<string, Set<SignalKind>>, idA: string, idB: string, kind: SignalKind) {
  const key = pairKey(idA, idB)
  const set = map.get(key) ?? new Set<SignalKind>()
  set.add(kind)
  map.set(key, set)
}

/** Counts the pairs actually compared, so a test can check the blocking without timing it. */
export type DuplicateSearchStats = { comparisons: number }

function addBlockPairs(map: Map<string, Set<SignalKind>>, ids: string[], kind: SignalKind, stats?: DuplicateSearchStats) {
  if (ids.length < 2) return
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (stats) stats.comparisons++
      addSignal(map, ids[i], ids[j], kind)
    }
  }
}

/**
 * Ranking: a name match alone ranks above a phone- or email-only match (the latter two are never
 * "probably the same person" on their own — see Precautions), and any second independent signal
 * alongside a name match ranks higher still. A birth date match (the most individually
 * distinguishing signal available) ranks the combination highest.
 */
const SIGNAL_WEIGHT: Record<SignalKind, number> = {
  name: 1,
  phone: 2,
  email: 2,
  address_to_verify: 2,
  birth_date: 3,
}

function pairScore(signals: SignalKind[]): number {
  const sum = signals.reduce((s, k) => s + SIGNAL_WEIGHT[k], 0)
  return signals.includes("name") ? sum + 5 : sum
}

function reasonsFor(signals: SignalKind[]): string[] {
  const has = (k: SignalKind) => signals.includes(k)
  const reasons: string[] = []
  if (has("name")) {
    reasons.push("Même nom et prénom, après normalisation : un homonyme n'est pas forcément la même personne.")
  }
  if (has("phone")) {
    reasons.push(
      has("name")
        ? "Même numéro de téléphone, après normalisation."
        : "Numéro partagé possible : un numéro commun (famille, standard) ne veut pas dire la même personne.",
    )
  }
  if (has("email")) {
    reasons.push(
      has("name")
        ? "Adresses email très proches l'une de l'autre : une faute de frappe est possible."
        : "Adresse partagée possible : une adresse commune ne veut pas dire la même personne.",
    )
  }
  if (has("address_to_verify")) {
    reasons.push("L'une des deux fiches a une adresse à vérifier, proche de l'autre : fiches peut-être en double.")
  }
  if (has("birth_date")) {
    reasons.push("Même date de naissance.")
  }
  return reasons
}

/**
 * Candidate pairs within one organization's members, ranked by signal combination. Tombstones
 * (`mergedIntoId` set) are filtered out up front — they must never be suggested, whichever side
 * of a pair they'd be on.
 */
export function findDuplicatePairs(members: DuplicateMemberInput[], stats?: DuplicateSearchStats): DuplicatePair[] {
  const active = members.filter((m) => !m.mergedIntoId)
  const byId = new Map(active.map((m) => [m.id, m]))
  const pairSignals = new Map<string, Set<SignalKind>>()

  const nameBlocks = new Map<string, string[]>()
  for (const m of active) {
    const key = normalizeFullName(m.firstName, m.lastName)
    if (!key) continue
    const list = nameBlocks.get(key) ?? []
    list.push(m.id)
    nameBlocks.set(key, list)
  }
  for (const ids of nameBlocks.values()) addBlockPairs(pairSignals, ids, "name", stats)

  const phoneBlocks = new Map<string, string[]>()
  for (const m of active) {
    const key = normalizePhone(m.phone)
    if (!key) continue
    const list = phoneBlocks.get(key) ?? []
    list.push(m.id)
    phoneBlocks.set(key, list)
  }
  for (const ids of phoneBlocks.values()) addBlockPairs(pairSignals, ids, "phone", stats)

  const emailBlocks = new Map<string, string[]>()
  for (const m of active) {
    if (!m.email) continue
    const key = emailBlockKey(m.email)
    if (!key) continue
    const list = emailBlocks.get(key) ?? []
    list.push(m.id)
    emailBlocks.set(key, list)
  }
  for (const ids of emailBlocks.values()) {
    if (ids.length < 2) continue
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = byId.get(ids[i])!
        const b = byId.get(ids[j])!
        if (stats) stats.comparisons++
        if (emailsAreClose(a.email, b.email)) addSignal(pairSignals, ids[i], ids[j], "email")
      }
    }
  }

  // Address-to-verify and birth date only ever reinforce a pair that already shares a name — the
  // issue's own signal list pairs them with "another very similar record", not alone.
  for (const [key, signals] of pairSignals) {
    if (!signals.has("name")) continue
    const [idA, idB] = key.split("\u0000")
    const a = byId.get(idA)!
    const b = byId.get(idB)!
    if (a.addressToVerify || b.addressToVerify) signals.add("address_to_verify")
    if (a.birthDate && b.birthDate && a.birthDate.getTime() === b.birthDate.getTime()) signals.add("birth_date")
  }

  const pairs: DuplicatePair[] = []
  for (const [key, signalSet] of pairSignals) {
    const [memberIdA, memberIdB] = key.split("\u0000")
    const signals = [...signalSet].sort() as SignalKind[]
    pairs.push({ memberIdA, memberIdB, signals, score: pairScore(signals), reasons: reasonsFor(signals) })
  }
  return pairs.sort((x, y) => y.score - x.score || x.memberIdA.localeCompare(y.memberIdA))
}

// ── Dismissals ────────────────────────────────────────────────────────────────

/** A stable id for "this combination of signal kinds" — sorted, joined, never a personal value. */
export function signalsFingerprint(signals: SignalKind[]): string {
  return [...signals].sort().join("+")
}

export interface DismissalRecord {
  volunteerIdA: string
  volunteerIdB: string
  signalsFingerprint: string
}

/**
 * Drops a pair only when it was dismissed with the exact same signal combination it has now — a
 * new kind of signal (e.g. a birth date added later) changes the fingerprint, so the pair comes
 * back (#601's "dismiss without hiding later relevant changes").
 */
export function withoutDismissed<T extends { memberIdA: string; memberIdB: string; signals: SignalKind[] }>(
  pairs: T[],
  dismissed: DismissalRecord[],
): T[] {
  const dismissedKeys = new Set(dismissed.map((d) => `${pairKey(d.volunteerIdA, d.volunteerIdB)}\u0000${d.signalsFingerprint}`))
  return pairs.filter((p) => !dismissedKeys.has(`${pairKey(p.memberIdA, p.memberIdB)}\u0000${signalsFingerprint(p.signals)}`))
}
