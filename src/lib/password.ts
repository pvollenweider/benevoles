// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"

/**
 * bcrypt only uses the first 72 bytes of a password (#359): beyond that, two passwords sharing
 * their first 72 bytes would be equivalent. Counted in UTF-8 bytes, so accented letters count
 * double. Applies when a password is set; login keeps accepting longer existing passwords
 * (MAX_LOGIN_PASSWORD_LENGTH) so nobody who set one before this rule is locked out.
 */
export const MAX_PASSWORD_BYTES = 72
export const passwordBytes = (p: string) => new TextEncoder().encode(p).length

/** Sanity bound on what the login form accepts before bcrypt (not a policy). */
export const MAX_LOGIN_PASSWORD_LENGTH = 1024

export const PASSWORD_RULES = [
  { id: "length",    label: "10 caractères minimum",           test: (p: string) => p.length >= 10 },
  { id: "upper",     label: "Une lettre majuscule",            test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower",     label: "Une lettre minuscule",            test: (p: string) => /[a-z]/.test(p) },
  { id: "digit",     label: "Un chiffre",                      test: (p: string) => /[0-9]/.test(p) },
  { id: "special",   label: "Un caractère spécial (!@#$…)",    test: (p: string) => /[^A-Za-z0-9]/.test(p) },
  { id: "maxBytes",  label: "72 octets maximum (une lettre accentuée compte pour 2, un emoji pour 4)", test: (p: string) => passwordBytes(p) <= MAX_PASSWORD_BYTES },
]

export function passwordErrors(password: string): string[] {
  return PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.label)
}

export const passwordSchema = z.string().superRefine((val, ctx) => {
  for (const err of passwordErrors(val)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: err })
  }
})
