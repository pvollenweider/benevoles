// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Reusable message templates (#482) and their variables. A template fills the subject and the
 * message of « Écrire aux bénévoles »; the text stays editable before each send. Variables are
 * replaced per recipient when the email is built; a literal brace is written `{{` or `}}`.
 * Unknown variables, or {poste} / {créneau} without a role or shift audience, are refused before
 * sending, never sent raw. Pure.
 */
import { z } from "zod"
import { OTHER_CATEGORY, TEMPLATE_CATEGORIES } from "./message-template-category"

export const TEMPLATE_LIMIT = 100
export const TEMPLATE_NAME_MAX = 60

export const VARIABLES = {
  prénom: "Prénom du destinataire",
  événement: "Titre de l'événement",
  poste: "Poste choisi (destinataires « Les bénévoles d'un poste » ou « d'un créneau »)",
  créneau: "Créneau choisi (destinataires « Les bénévoles d'un créneau »)",
} as const
export type VariableName = keyof typeof VARIABLES

export type VariableContext = { prénom: string; événement: string; poste?: string; créneau?: string }

const TOKEN = /\{\{|\}\}|\{([^{}\n]{1,30})\}/g
const norm = (v: string) => v.trim().toLocaleLowerCase("fr")

/** Names of the variables used in a text, as written (trimmed). */
export function variablesIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(TOKEN)) if (m[1] !== undefined) out.push(m[1].trim())
  return out
}

/** What is wrong with the variables of a text for this audience; empty when it can be sent. */
export function templateProblems(text: string, audienceKind: string): string[] {
  const problems: string[] = []
  for (const v of new Set(variablesIn(text))) {
    const name = norm(v)
    if (!(name in VARIABLES)) {
      problems.push(`Variable inconnue : {${v}}. Variables possibles : ${Object.keys(VARIABLES).map((k) => `{${k}}`).join(", ")}.`)
    } else if (name === "poste" && audienceKind !== "role" && audienceKind !== "shift") {
      problems.push("{poste} ne s'utilise qu'avec les destinataires « Les bénévoles d'un poste » ou « Les bénévoles d'un créneau ».")
    } else if (name === "créneau" && audienceKind !== "shift") {
      problems.push("{créneau} ne s'utilise qu'avec les destinataires « Les bénévoles d'un créneau ».")
    }
  }
  return problems
}

/** Unknown variables only, for the template editor (the audience isn't chosen yet there). */
export function unknownVariables(text: string): string[] {
  return templateProblems(text, "shift").filter((p) => p.startsWith("Variable inconnue"))
}

/** A library placeholder the organiser has not replaced yet (#1414). */
export const PLACEHOLDER_PROBLEM = "Le texte contient encore « [à compléter] » : remplacez cette mention par l'information réelle avant l'envoi."
const PLACEHOLDER = /\[\s*à\s+compléter/i

export function hasUnfilledPlaceholder(text: string): boolean {
  return PLACEHOLDER.test(text)
}

/** Placeholder problems of a text; a sibling of templateProblems() so the library can still be validated. */
export function placeholderProblems(text: string): string[] {
  return hasUnfilledPlaceholder(text) ? [PLACEHOLDER_PROBLEM] : []
}

/**
 * Everything that blocks a send (#482, #1414): unknown or misplaced variables, and a `[à compléter]`
 * left in the text. The APIs, the scheduled dispatcher and the form all use this one rule.
 */
export function sendProblems(text: string, audienceKind: string): string[] {
  return [...templateProblems(text, audienceKind), ...placeholderProblems(text)]
}

/** Replaces the variables for one recipient (text in, text out: the email escapes it). */
export function renderVariables(text: string, ctx: VariableContext): string {
  return text.replace(TOKEN, (match, name: string | undefined) => {
    if (match === "{{") return "{"
    if (match === "}}") return "}"
    const value = ctx[norm(name ?? "") as VariableName]
    return value ?? match
  })
}

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(TEMPLATE_NAME_MAX),
  subject: z.string().trim().min(1, "L'objet est obligatoire.").max(120),
  body: z.string().trim().min(1, "Le message est obligatoire.").max(2000),
  /**
   * Library category (#1414): one of the known categories, « Autres » for a template written by
   * hand or a client that omits it. Older rows may still hold another value; writes are restricted.
   */
  category: z.enum(TEMPLATE_CATEGORIES, { error: "Choisissez une catégorie dans la liste." }).default(OTHER_CATEGORY),
})
