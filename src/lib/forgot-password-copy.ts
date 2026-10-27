// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The « Mot de passe oublié » confirmation (/admin/forgot-password). The same words in every
 * case: known address or not, inactive account, or a request over the per-address cap
 * (src/lib/password-recovery.ts, which then changes nothing). So it never claims an email left,
 * never hints that the cap was hit, and says what holds in all of them: each request under the
 * cap replaces the account's link, a request over it keeps the last one working. Pure, no Prisma:
 * the page is a client component.
 */
export const FORGOT_PASSWORD_DONE = {
  title: "Demande enregistrée",
  body: "Si cette adresse est associée à un compte, vous recevrez un lien valable 1 heure.",
  hint: "Rien reçu ? Regardez dans vos indésirables. Le dernier lien reçu reste valable. Après plusieurs demandes, attendez une heure avant de redemander.",
} as const
