// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { orgLinksOpen } from "./org-lifecycle"

/**
 * Beta access to advanced features (#1168): one gate shared by every advanced capability (sectors
 * first, then swaps, dated availability, drafts). Three levels, each one required:
 *
 * 1. operator: the capability is open for trial (PlatformSetting `beta.capabilities`, super admin
 *    space, « Fonctions bêta »), and shipped in this version of the code;
 * 2. organisation: an owner turned on the beta in Paramètres (`Organization.betaOptInAt`), and the
 *    organisation is active and not suspended;
 * 3. event: each capability has its own event option, offered only when levels 1 and 2 allow it
 *    (added by the lot that ships the capability).
 *
 * Contract for the lots that use it (BE06): `betaAdoptionAllowed` (and its loader `canAdoptBeta`
 * in beta-access.ts) gates NEW adoptions only. An event that already adopted a capability keeps
 * using it after the organisation leaves the beta or the operator closes the capability: callers
 * check « already adopted » first and never hide, disable or delete what is in use. Closing a
 * capability is the operator's emergency stop for new adoptions, nothing more.
 *
 * Not a plan, quota or permission builder: no per-user flag, no pricing. Pure and Prisma-free, so
 * client components can read the labels.
 */

export type BetaCapability = {
  label: string
  description: string
  /**
   * Whether this version of the code contains the capability. False until the lot that builds it
   * is merged (that lot flips it): the operator cannot open it, a stored « open » is ignored and
   * nobody can adopt it, so no owner is ever promised a feature that does not exist yet.
   */
  shipped: boolean
}

export type BetaRegistry = Record<string, BetaCapability>

/** Every capability that can be opened for trial: id → what the owner reads in Paramètres. */
export const BETA_CAPABILITIES = {
  // #1147, lot A1: flips `shipped` when it is merged.
  sectors: {
    label: "Secteurs",
    description: "Regrouper plusieurs postes sous une même coordination.",
    shipped: false,
  },
} as const satisfies BetaRegistry

export type BetaCapabilityId = keyof typeof BETA_CAPABILITIES

export const BETA_CAPABILITY_IDS = Object.keys(BETA_CAPABILITIES) as BetaCapabilityId[]

/** The PlatformSetting row holding the operator's list (value `{ open: string[] }`). */
export const BETA_SETTING_KEY = "beta.capabilities"

export function isBetaCapabilityId(id: unknown, registry: BetaRegistry = BETA_CAPABILITIES): id is BetaCapabilityId {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(registry, id)
}

/** Whether the operator may open `id` in this version: a known capability that is shipped. */
export function isOpenableCapability(id: unknown, registry: BetaRegistry = BETA_CAPABILITIES): id is BetaCapabilityId {
  return isBetaCapabilityId(id, registry) && registry[id].shipped === true
}

function idList(value: unknown): unknown[] | null {
  const list = Array.isArray(value) ? value : (value as { open?: unknown } | null | undefined)?.open
  return Array.isArray(list) ? list : null
}

/**
 * The capabilities effectively open, from the stored value: openable ids only, each once, in the
 * registry's order. Anything else (unknown id, a capability removed from the code or not shipped
 * yet, a malformed value, no row) is ignored: it never opens anything.
 */
export function parseOpenCapabilities(value: unknown, registry: BetaRegistry = BETA_CAPABILITIES): BetaCapabilityId[] {
  const list = idList(value)
  if (!list) return []
  const wanted = new Set(list.filter((id) => isOpenableCapability(id, registry)))
  return (Object.keys(registry) as BetaCapabilityId[]).filter((id) => wanted.has(id))
}

/**
 * The operator's request (`{ open: string[] }`): the full list of capabilities to keep open. Unlike
 * a stored value, an id that cannot be opened is refused, so the screen never pretends it opened it.
 */
export function parseCapabilityRequest(body: unknown, registry: BetaRegistry = BETA_CAPABILITIES): { ok: true; open: BetaCapabilityId[] } | { ok: false; error: string } {
  const list = idList(body)
  if (!list || list.some((id) => typeof id !== "string")) return { ok: false, error: "Indiquez la liste des fonctions à ouvrir." }
  if (list.some((id) => !isOpenableCapability(id, registry))) return { ok: false, error: "Cette fonction n'existe pas ou n'est pas disponible dans cette version." }
  return { ok: true, open: parseOpenCapabilities(list, registry) }
}

/**
 * The list to store for the operator's new open list: those ids, plus the stored ids this version
 * cannot open (another version's capability during a deploy, one not shipped here), kept as they
 * were so that saving this screen never closes what it does not show.
 */
export function storedOpenList(open: readonly BetaCapabilityId[], stored: unknown, registry: BetaRegistry = BETA_CAPABILITIES): string[] {
  const kept = (idList(stored) ?? []).filter((id): id is string => typeof id === "string" && !isOpenableCapability(id, registry))
  return [...new Set([...open, ...kept])]
}

/** What the operator's change opens and closes, for the operator log. */
export function capabilityChanges(before: readonly BetaCapabilityId[], after: readonly BetaCapabilityId[]): { opened: BetaCapabilityId[]; closed: BetaCapabilityId[] } {
  return {
    opened: after.filter((id) => !before.includes(id)),
    closed: before.filter((id) => !after.includes(id)),
  }
}

export type BetaOrgState = {
  active: boolean
  suspendedAt: Date | string | null
  betaOptInAt: Date | string | null
}

/**
 * Whether the organisation may adopt `capabilityId` on a new event (or switch it on for an event
 * that does not use it yet). Levels 1 and 2 only; see the contract above for what is already in use.
 */
export function betaAdoptionAllowed(org: BetaOrgState | null | undefined, openCapabilities: readonly string[], capabilityId: string, registry: BetaRegistry = BETA_CAPABILITIES): boolean {
  if (!isOpenableCapability(capabilityId, registry)) return false
  if (!openCapabilities.includes(capabilityId)) return false
  return orgLinksOpen(org) && !!org?.betaOptInAt
}

/**
 * Whether Paramètres shows the beta card: while something is open to try, or while the
 * organisation takes part (so that it can always leave). Otherwise the page is exactly what it
 * was before the beta existed (BE01).
 */
export function betaCardVisible(openCapabilities: readonly string[], optedIn: boolean): boolean {
  return optedIn || openCapabilities.length > 0
}

export type BetaOptInDecision =
  | { ok: true; change: "opt_in" | "opt_out" | null }
  | { ok: false; status: 400 | 409; error: string }

export const BETA_NOTHING_OPEN_ERROR = "Aucune fonction bêta n'est ouverte à l'essai pour le moment."

/**
 * What an owner's request does. Joining needs something open to try; leaving is always possible.
 * Asking for the current state again changes nothing (no log entry). Neither touches an event.
 */
export function decideBetaOptIn(optedIn: boolean, request: unknown, openCapabilities: readonly string[]): BetaOptInDecision {
  const wanted = (request as { optIn?: unknown } | null | undefined)?.optIn
  if (typeof wanted !== "boolean") return { ok: false, status: 400, error: "Indiquez s'il faut activer ou non les fonctions bêta." }
  if (wanted === optedIn) return { ok: true, change: null }
  if (wanted && openCapabilities.length === 0) return { ok: false, status: 409, error: BETA_NOTHING_OPEN_ERROR }
  return { ok: true, change: wanted ? "opt_in" : "opt_out" }
}

// ── Texts of the Paramètres card (owners) and of the organisers' read-only row ────────────────

export type BetaParticipation = { optedIn: boolean; optedInAt: string | null; optedInByName: string | null }

export const BETA_SWITCH_LABEL = "Essayer les fonctions avancées en bêta"

const dateLabel = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString("fr-FR", { timeZone, day: "numeric", month: "long", year: "numeric" })

/** The state line above the switch: since when, and who turned it on when the account still exists. */
export function betaStateSentence(p: BetaParticipation, timeZone: string): string {
  if (!p.optedIn) return "Votre organisation ne participe pas à la bêta."
  const since = p.optedInAt ? ` depuis le ${dateLabel(p.optedInAt, timeZone)}` : ""
  const name = p.optedInByName?.trim()
  return `Votre organisation participe à la bêta${since}${name ? ` (activée par ${name})` : ""}.`
}

/** The switch's description: what turning it on or off does, or why it cannot be turned on. */
export function betaSwitchHint(optedIn: boolean, somethingOpen: boolean): string {
  if (optedIn) return "Ne plus activer de nouvelles fonctions bêta : désactivez l'interrupteur. Ce que vos événements utilisent déjà continue de fonctionner, rien n'est supprimé. Vous pourrez revenir à la bêta plus tard."
  if (!somethingOpen) return "Vous pourrez participer de nouveau dès qu'une fonction sera ouverte à l'essai."
  return "Vos événements existants ne changent pas : chaque fonction se choisit ensuite dans les paramètres de l'événement. Rien n'est envoyé à vos bénévoles."
}

/** The organisers' read-only row « Participation à la bêta ». */
export function betaReadOnlyValue(p: BetaParticipation, timeZone: string): string {
  if (!p.optedIn) return "non"
  return p.optedInAt ? `oui, depuis le ${dateLabel(p.optedInAt, timeZone)}` : "oui"
}
