// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

export const memberLastNamesV2 = ["Favre", "Favre", "Morel", "Mercier", "Renaud", "Dumont", "Berger", "Perrin", "Perret", "Roux", "Leroy", "Dubois", "Girard", "Martin", "Blanc", "Fontaine", "Chevalier", "Meyer", "Garnier", "Rochat", "Chappuis", "Baud", "Henry", "Dutoit", "Richard", "Colin", "Besson", "Gaillard", "Picard", "Rey", "Gautier", "Schmid", "Laurent", "Bovet", "Bonnet", "Fischer"] as const
export type SeedIdentity = { id: string; organizationId: string | null; firstName: string; lastName: string; email: string | null; phone: string | null; tags: string[]; active: boolean; notes: string | null; birthDate: Date | string | null; availabilityPeriods: string[]; availabilityNote: string | null; createdAt: Date | string }
export type SeedProofV2 = { schemaVersion: 2; scenario: "natural-member-seeds"; provenance: "actual-seed-write" | "exact-v1-migration"; observedAt: string; members: SeedIdentity[]; sha256: string }
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex")
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b)
const projection = (person: Partial<SeedIdentity>) => Object.fromEntries(["id", "organizationId", "firstName", "lastName", "email", "phone", "tags", "active", "notes", "birthDate", "availabilityPeriods", "availabilityNote", "createdAt"].map(key => [key, person[key as keyof SeedIdentity]]))

export function expectedMemberV2(index: number, invitation = false) {
  assert(Number.isInteger(index) && index >= 0 && index < 36)
  return { id: `video-member-management-${index}`, organizationId: "default", firstName: index < 2 ? "Stéphane" : invitation && index === 2 ? "René" : invitation && index === 3 ? "Aline" : ["Aline", "Émilie", "Sébastien", "Anaïs", "Nicolas", "Léon"][index % 6], lastName: invitation && index === 2 ? "Meyer" : memberLastNamesV2[index], email: index === 2 ? null : `video.membre.${index}@example.org`, phone: `079 000 ${String(index).padStart(2, "0")} 00`, active: index !== 35, tags: invitation && index === 2 ? ["accueil"] : invitation && index === 4 ? ["sécurité", "permis-b"] : index % 2 ? ["accueil"] : ["logistique", "permis-b"], notes: index === 2 ? "Contact à joindre par téléphone pour les horaires." : null, birthDate: null, availabilityPeriods: index % 2 ? ["morning"] : ["evening"], availabilityNote: index === 3 ? "Pas le dimanche" : null }
}
export function exactMemberSeedV2(person: Partial<SeedIdentity>) {
  const match = /^video-member-management-(\d+)$/.exec(person.id ?? "")
  if (!match) return false
  const index = Number(match[1])
  if (index > 35 || String(index) !== match[1]) return false
  const { createdAt, ...fields } = projection(person)
  return Number.isFinite(new Date((createdAt as Date | string | undefined) ?? "").getTime()) && (equal(fields, expectedMemberV2(index)) || equal(fields, expectedMemberV2(index, true)))
}
/** Legacy names are admissible only to authorize migration, never a new capture. */
export function exactLegacyM2ForMigration(person: Partial<SeedIdentity>) {
  if (person.id !== "video-member-management-2") return false
  const normal = { ...expectedMemberV2(2), lastName: "Morel 3" }
  const invited = { ...expectedMemberV2(2, true), lastName: "Sansmail" }
  const { createdAt, ...fields } = projection(person)
  return Number.isFinite(new Date(createdAt as string ?? "").getTime()) && (equal(fields, normal) || equal(fields, invited))
}
export function createSeedProofV2(members: SeedIdentity[], provenance: SeedProofV2["provenance"], observedAt: string): SeedProofV2 {
  assert(members.length === 36 && new Set(members.map(member => member.id)).size === 36 && members.every(exactMemberSeedV2), "Only all 36 exact natural-name seed identities can be proven")
  assert(Number.isFinite(Date.parse(observedAt)) && members.every(member => new Date(member.createdAt).getTime() <= Date.parse(observedAt)), "Seed creation dates must precede actual observation")
  const payload = { schemaVersion: 2 as const, scenario: "natural-member-seeds" as const, provenance, observedAt, members }
  return { ...payload, sha256: digest(payload) }
}
export function validateSeedProofV2(proof: SeedProofV2, now = Date.now()) {
  assert(proof?.schemaVersion === 2 && proof.scenario === "natural-member-seeds" && ["actual-seed-write", "exact-v1-migration"].includes(proof.provenance), "Natural-name creation or migration proof required")
  const expected = createSeedProofV2(proof.members, proof.provenance, proof.observedAt)
  assert(proof.sha256 === expected.sha256 && Date.parse(proof.observedAt) <= now + 60_000 && Date.parse(proof.observedAt) >= now - 30 * 86_400_000, "Seed proof hash/date invalid")
  return proof
}
export function ownsNaturalMemberSeed(person: Partial<SeedIdentity>, proof: SeedProofV2 | null, now = Date.now()) {
  if (!proof || !exactMemberSeedV2(person)) return false
  try { validateSeedProofV2(proof, now) } catch { return false }
  return proof.members.some(member => equal(projection(member), projection(person)))
}
export async function readSeedProofV2(): Promise<SeedProofV2 | null> {
  try { return validateSeedProofV2(JSON.parse(await readFile(path.resolve("videos/output/member-fixture-v2/seed-proof.json"), "utf8"))) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error }
}
