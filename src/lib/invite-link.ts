// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The activation link of an administrator invite. Only the hash of the token is stored (#269),
 * so every (re)issue produces a new link and the previous one stops working: whoever issues a
 * link must show the new one, never a stale copy.
 */
export function inviteLink(appUrl: string | undefined, token: string): string {
  const base = (appUrl && appUrl.trim() ? appUrl.trim() : "http://localhost:3000").replace(/\/+$/, "")
  return `${base}/admin/accept-invite?token=${encodeURIComponent(token)}`
}

export const RESENT_LINK_NOTICE = "Un nouveau lien a été généré : l'ancien ne fonctionne plus. Celui-ci est identique à celui de l'email."
