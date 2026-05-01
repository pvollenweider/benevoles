import { z } from "zod"

export const PASSWORD_RULES = [
  { id: "length",    label: "10 caractères minimum",           test: (p: string) => p.length >= 10 },
  { id: "upper",     label: "Une lettre majuscule",            test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower",     label: "Une lettre minuscule",            test: (p: string) => /[a-z]/.test(p) },
  { id: "digit",     label: "Un chiffre",                      test: (p: string) => /[0-9]/.test(p) },
  { id: "special",   label: "Un caractère spécial (!@#$…)",    test: (p: string) => /[^A-Za-z0-9]/.test(p) },
]

export function passwordErrors(password: string): string[] {
  return PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.label)
}

export const passwordSchema = z.string().superRefine((val, ctx) => {
  for (const err of passwordErrors(val)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: err })
  }
})
