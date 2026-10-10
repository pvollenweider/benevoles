// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { addressStatus, type AddressOutcomeInput } from "./address-status"

/**
 * Whether anyone can still read an organisation's emails (#811): its active administrators, and
 * how many of their current addresses were last refused for good by the receiving server (#598,
 * the « Adresse à vérifier » rule of #599). A temporary incident still counts as reachable: a new
 * attempt is planned. Pure: the loader hashes each address and passes the recent outcomes for
 * those hashes, from any organisation, since a refused mailbox is a fact about the address.
 *
 * Flagged in the super admin space only. It never blocks the check: a space nobody can be reached
 * at is still deactivated on schedule, and stays reactivatable from the sign-in page.
 */
export type AdminReachability = { active: number; toVerify: number }

export function adminReachability(
  adminAddressHashes: string[],
  outcomes: AddressOutcomeInput[],
  now: Date = new Date(),
): AdminReachability {
  const toVerify = adminAddressHashes.filter((h) => addressStatus(h, outcomes, now).kind === "to_verify").length
  return { active: adminAddressHashes.length, toVerify }
}

/** No active administrator, or every one of their addresses refused: no email of the check gets through. */
export function noReachableAdmin(r: AdminReachability): boolean {
  return r.active - r.toVerify <= 0
}

/** Sentence added to the operator's last-reminder alert when nobody can read it; empty otherwise. */
export function unreachableNote(r: AdminReachability): string {
  if (r.active === 0) return " Aucun administrateur actif : à contacter autrement."
  if (noReachableAdmin(r)) return " Aucun administrateur joignable (adresses refusées) : à contacter autrement."
  return ""
}

/** Short wording for the report, next to the number of active administrators; null when all is fine. */
export function reachabilityNote(r: AdminReachability): string | null {
  if (r.active === 0) return "aucun administrateur actif"
  if (noReachableAdmin(r)) return r.active === 1 ? "adresse refusée : administrateur injoignable" : "toutes les adresses refusées : aucun administrateur joignable"
  if (r.toVerify > 0) return `dont ${r.toVerify} adresse${r.toVerify > 1 ? "s" : ""} à vérifier`
  return null
}
