// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Whether an organisation's links still open anything: the personal links of its volunteers, its
 * sector leaders' links, its waitlist offers and member invitations, and the calendar subscriptions
 * they give. A deactivated organisation (by the operator, or for inactivity) and a suspended one
 * open nothing through them, whatever the host the request comes through: no data, no change. The
 * same answer for both, so a link never tells a suspension from a deactivation.
 *
 * The check runs where the link is resolved (each route under src/app/api/public that looks a token
 * up, and the waitlist offer page), not on the organisation's subdomain only: those addresses also
 * answer on the main domain. Reactivating the organisation makes the same links work again.
 *
 * Pure and Prisma-free: the routes select `ORG_LIFECYCLE_SELECT` on the link's organisation.
 */

export type OrgLifecycleState = { active: boolean; suspendedAt: Date | string | null }

/** What a route selects on the link's organisation to decide. */
export const ORG_LIFECYCLE_SELECT = { active: true, suspendedAt: true } as const

/** The same condition as a database filter on the organisation, for lookups that answer the same either way. */
export const LINKS_OPEN_WHERE = { active: true, suspendedAt: null } as const

/** Whether the organisation's links may give data or allow a change. A missing one opens nothing. */
export function orgLinksOpen(org: OrgLifecycleState | null | undefined): boolean {
  return !!org && org.active === true && !org.suspendedAt
}

/** The machine-readable refusal the pages recognise. */
export const ORG_UNAVAILABLE_CODE = "org_unavailable"

/** What a refused link answers: no detail about the organisation's state. */
export const ORG_UNAVAILABLE_ERROR = "Cet espace n'est pas disponible."

export const ORG_UNAVAILABLE_STATUS = 403

/** Whether a JSON answer is that refusal. */
export function isOrgUnavailable(body: unknown): boolean {
  return typeof body === "object" && body !== null && (body as { code?: unknown }).code === ORG_UNAVAILABLE_CODE
}

/** The contact address carried by that refusal, or null. */
export function orgUnavailableContact(body: unknown): string | null {
  const contact = typeof body === "object" && body !== null ? (body as { contact?: unknown }).contact : null
  return typeof contact === "string" && /^[^\s@:/]+@[^\s@:/]+$/.test(contact) ? contact : null
}

/** The page shown instead of the link's content: the same for a deactivated or suspended space. */
export const ORG_UNAVAILABLE_TITLE = "Espace indisponible"

/**
 * The page's text. The contact line names the instance's contact address (contactEmail(), sent
 * by the server with the refusal): where a volunteer or a sector leader asks about their personal
 * data once the organisation's admins can no longer sign in, the operator helping to pass the
 * request on (privacy policy, section 6). Volunteers are addressed with « tu », sector leaders with « vous » (PRODUCT.md). */
export function orgUnavailableCopy(audience: "volunteer" | "leader"): { text: string; contactIntro: string; contactOutro: string } {
  return audience === "volunteer"
    ? {
        text: "L'espace de cette organisation n'est pas disponible : ce lien ne donne plus accès à tes inscriptions.",
        contactIntro: "Pour une question sur tes données personnelles, écris à",
        contactOutro: "nous t'aiderons à transmettre ta demande à l'organisation.",
      }
    : {
        text: "L'espace de cette organisation n'est pas disponible : ce lien ne donne plus accès à la liste des bénévoles.",
        contactIntro: "Pour une question sur vos données personnelles, écrivez à",
        contactOutro: "nous vous aiderons à transmettre votre demande à l'organisation.",
      }
}
