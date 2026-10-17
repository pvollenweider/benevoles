// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Length limits of the public sign-up form (#1047), shared by the API schema and the form's
 * inputs. Far above normal use: they only stop a request from storing kilobytes of text that
 * organisers then see in their lists and CSV exports.
 */

/** Same limit as a member's phone in the admin (api/admin/members). */
export const SIGNUP_PHONE_MAX = 50
export const SIGNUP_COMMENT_MAX = 2000
/** Database ids (cuid) are 25 characters; tokens and codes have their own limits in the schema. */
export const SIGNUP_ID_MAX = 100
/** Shifts picked in one submission. */
export const SIGNUP_SHIFTS_MAX = 1000

/**
 * A phone or comment over its limit, in words the volunteer can act on. A phone saved before the
 * limit existed can be longer and comes back pre-filled (remembered contact, personal page,
 * invite): `maxLength` doesn't cut a value set by the page, so the form and the API both say which
 * field to shorten instead of a generic refusal.
 */
export function tooLongSignupField(form: { phone?: unknown; comment?: unknown }): { field: "phone" | "comment"; message: string } | null {
  if (typeof form.phone === "string" && form.phone.length > SIGNUP_PHONE_MAX) {
    return { field: "phone", message: `Le téléphone ne peut pas dépasser ${SIGNUP_PHONE_MAX} caractères. Raccourcis-le, puis confirme à nouveau.` }
  }
  if (typeof form.comment === "string" && form.comment.length > SIGNUP_COMMENT_MAX) {
    return { field: "comment", message: `Le commentaire ne peut pas dépasser ${SIGNUP_COMMENT_MAX} caractères. Raccourcis-le, puis confirme à nouveau.` }
  }
  return null
}
