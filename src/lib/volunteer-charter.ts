// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// Imported by a client component (OrgCharterForm): no Prisma, no Node built-ins here.

/**
 * The closing insurance paragraph of the default charter, per « Assurance RC fournie par
 * l'organisation ». A civil liability (RC) policy covers damage caused to third parties, never the
 * volunteer's own accidents: those stay with the volunteer's accident insurance either way, which is
 * why section 1 asks for it in both versions.
 */
export const INSURANCE_CLAUSE_WITH_ORG_RC =
  "L'organisation dispose d'une assurance responsabilité civile qui couvre les dommages causés à des tiers pendant les activités bénévoles. Les accidents dont la personne bénévole serait elle-même victime relèvent de sa propre assurance accidents."
export const INSURANCE_CLAUSE_WITHOUT_ORG_RC =
  "L'organisation ne fournit pas d'assurance responsabilité civile pour ces activités : la personne bénévole répond elle-même auprès des tiers des dommages qu'elle causerait, et vérifie que son assurance RC privée la couvre."

/** The same paragraphs as worded before this fix (the first said the RC covered the volunteer). */
export const LEGACY_INSURANCE_CLAUSE_WITH_ORG_RC =
  "La personne bénévole sera couverte pendant toute la durée de sa présence par l'assurance responsabilité civile de l'organisation. Elle reste néanmoins responsable auprès des tiers de tout dommage qu'elle causerait personnellement."
export const LEGACY_INSURANCE_CLAUSE_WITHOUT_ORG_RC =
  "La personne bénévole est responsable de sa propre couverture accidents (LAA ou assurance personnelle équivalente). Elle reste responsable auprès des tiers de tout dommage qu'elle causerait personnellement."

export function insuranceClause(hasOrgInsurance: boolean): string {
  return hasOrgInsurance ? INSURANCE_CLAUSE_WITH_ORG_RC : INSURANCE_CLAUSE_WITHOUT_ORG_RC
}

function charterBody(accidentBullet: string, closing: string): string {
  return `A été convenu que :

1. Engagement bénévole

La personne bénévole s'engage librement pour mener une activité non salariée en faveur de l'organisation, en dehors de son temps professionnel et familial. Elle s'engage :

- À respecter toutes les personnes avec qui elle sera en contact, quelles que soient leur origine, leur genre, leur sexualité ou leur identité d'expression,
- À respecter ses disponibilités validées avec la responsable bénévole,
- À participer aux missions confiées par la responsable bénévole selon ses disponibilités,
${accidentBullet}

2. En outre, la personne bénévole accepte

- De respecter les consignes de sécurité en vigueur,
- D'être garante de l'image de l'organisation,
- De considérer son engagement avec tout le sérieux nécessaire au bon déroulement des activités,
- De prévenir la responsable bénévole dès que possible en cas de désistement ou de changement de disponibilité, afin de ne pas compromettre l'organisation générale de l'équipe.

3. L'organisation s'engage envers la personne bénévole

- À fournir les informations et le matériel nécessaires à l'exercice des missions,
- À assurer un environnement de travail respectueux et bienveillant,
- À remettre, sur demande, un certificat de bénévolat à l'issue de l'engagement.

${closing}`
}

const ACCIDENT_BULLET = "- À disposer d'une couverture accidents personnelle adéquate (LAA ou assurance équivalente)."
const LEGACY_ACCIDENT_BULLET = "- À s'assurer d'une couverture accidents personnelle adéquate (LAA)."

export function buildVolunteerCharter({ hasOrgInsurance = true }: { hasOrgInsurance?: boolean } = {}): string {
  return charterBody(ACCIDENT_BULLET, insuranceClause(hasOrgInsurance))
}

export const DEFAULT_VOLUNTEER_CHARTER = buildVolunteerCharter()

/**
 * The default texts as they were before this fix, kept verbatim. An organization that saved one
 * without editing it is still « not customised »: toggling the switch or resetting gives it the
 * current wording. Never rewritten in the database, and past acceptances keep their exact text
 * through CharterVersion (#569).
 */
export const LEGACY_DEFAULT_CHARTERS: Readonly<Record<"withOrgInsurance" | "withoutOrgInsurance", string>> = {
  withOrgInsurance: charterBody(LEGACY_ACCIDENT_BULLET, LEGACY_INSURANCE_CLAUSE_WITH_ORG_RC),
  withoutOrgInsurance: charterBody(LEGACY_ACCIDENT_BULLET, LEGACY_INSURANCE_CLAUSE_WITHOUT_ORG_RC),
}

/** Same normalisation as charter-hash.ts (which can't be imported here: Node crypto). */
function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").trim()
}

/**
 * Which default a text is, current or legacy, and for which insurance choice; null when the text
 * was customised (differs from all of them).
 */
export function matchDefaultCharter(text: string): { hasOrgInsurance: boolean; legacy: boolean } | null {
  const t = normalize(text)
  if (t === normalize(buildVolunteerCharter({ hasOrgInsurance: true }))) return { hasOrgInsurance: true, legacy: false }
  if (t === normalize(buildVolunteerCharter({ hasOrgInsurance: false }))) return { hasOrgInsurance: false, legacy: false }
  if (t === normalize(LEGACY_DEFAULT_CHARTERS.withOrgInsurance)) return { hasOrgInsurance: true, legacy: true }
  if (t === normalize(LEGACY_DEFAULT_CHARTERS.withoutOrgInsurance)) return { hasOrgInsurance: false, legacy: true }
  return null
}

export function isCustomizedCharter(text: string): boolean {
  return matchDefaultCharter(text) === null
}

/**
 * The text after the insurance switch is set to `hasOrgInsurance`: a default text (current or
 * legacy) becomes the current default for that choice; a customised text is kept as is, never
 * discarded (`kept: true`), and the form offers `planInsuranceParagraphUpdate` instead.
 */
export function charterTextAfterToggle(text: string, hasOrgInsurance: boolean): { text: string; kept: boolean } {
  if (isCustomizedCharter(text)) return { text, kept: true }
  return { text: buildVolunteerCharter({ hasOrgInsurance }), kept: false }
}

const ALL_INSURANCE_CLAUSES = [
  INSURANCE_CLAUSE_WITH_ORG_RC,
  INSURANCE_CLAUSE_WITHOUT_ORG_RC,
  LEGACY_INSURANCE_CLAUSE_WITH_ORG_RC,
  LEGACY_INSURANCE_CLAUSE_WITHOUT_ORG_RC,
]

export type InsuranceParagraphPlan =
  | { kind: "unchanged" }
  | { kind: "replace"; removed: string; added: string; text: string }
  | { kind: "append"; added: string; text: string }

/**
 * What « Mettre à jour le paragraphe sur l'assurance » would do to a customised text, shown before
 * it is applied: replace the first insurance paragraph of either version (old or current wording)
 * that doesn't match the choice, or append the right one at the end when the text has none.
 * Nothing to do when the right paragraph is already there and no other one is.
 */
export function planInsuranceParagraphUpdate(text: string, hasOrgInsurance: boolean): InsuranceParagraphPlan {
  const added = insuranceClause(hasOrgInsurance)
  const others = ALL_INSURANCE_CLAUSES.filter((clause) => clause !== added)
  const found = others
    .map((clause) => ({ clause, index: text.indexOf(clause) }))
    .filter((f) => f.index >= 0)
    .sort((a, b) => a.index - b.index)[0]
  if (found) {
    return {
      kind: "replace",
      removed: found.clause,
      added,
      text: text.slice(0, found.index) + added + text.slice(found.index + found.clause.length),
    }
  }
  if (text.includes(added)) return { kind: "unchanged" }
  const base = text.trimEnd()
  return { kind: "append", added, text: base ? `${base}\n\n${added}` : added }
}

/**
 * The exact charter text shown to a volunteer at public sign-up (#569): the organization's own
 * text when it saved one, the default for its insurance choice otherwise. Shared by the public page
 * (EventPageClient), the sign-up route, which hashes this same text as proof of what was accepted,
 * and the registrations page, which tells the current version apart from older ones.
 */
export function resolveCharterText(organizationCharter: string | null | undefined, hasOrgInsurance: boolean): string {
  return organizationCharter ?? buildVolunteerCharter({ hasOrgInsurance })
}

/** Read-only settings summary: a null charter is not missing, volunteers see the default text. */
export function charterStatusLabel(organizationCharter: string | null | undefined): "personnalisée" | "par défaut" {
  return organizationCharter == null ? "par défaut" : "personnalisée"
}
