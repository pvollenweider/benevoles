// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import type { PrismaClient } from "../../src/generated/prisma/client"

/** Fail closed before uploading the export classroom's captured screens. */
export async function verifyExportReviewFixture(db: PrismaClient, directory: string) {
  if (!process.env.DATABASE_URL?.includes("benevoles_video")) throw new Error("Local video database required")
  const organizationId = "video-data-exports"
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } })
  if (organization.slug !== "formation-exports" || organization.name !== "Formation — données et archives") throw new Error("Wrong export classroom")
  const people = await db.volunteer.findMany({ where: { organizationId }, orderBy: { id: "asc" } })
  const names = ["Léa", "Étienne", "Zoé", "Camille"]
  const notes = ["=1+1", "Fiche désactivée — exemple fictif.", "Prévenir à l'arrivée.", "@exemple"]
  if (people.length !== 4 || people.some((person, index) => person.id !== `video-data-exports-member-${index}` || person.firstName !== names[index] || person.lastName !== "Exemple" || person.email !== `video.exports.member.${index}@example.org` || !/^\+41 79 000 \d{4}$/.test(person.phone ?? "") || person.notes !== notes[index])) throw new Error("Export members are not the exact synthetic classroom")
  const admins = await db.adminUser.findMany({ where: { organizationId } })
  if (admins.length !== 1 || admins[0].id !== "video-data-exports-owner" || admins[0].name !== "Élodie Exemple" || admins[0].email !== "video.exports.owner@example.org") throw new Error("Export classroom administrator differs")
  const events = await db.event.findMany({ where: { organizationId }, include: { registrations: true, sectorLeaders: true } })
  if (events.length !== 1 || events[0].id !== "video-data-exports-event" || events[0].title !== "Fête des archives — démonstration" || events[0].registrations.length !== 3 || events[0].registrations.some(reg => !people.some(person => person.id === reg.volunteerId)) || events[0].sectorLeaders.length !== 1 || events[0].sectorLeaders[0].email !== "video.exports.leader@example.org" || events[0].sectorLeaders[0].name !== "Nicolas Exemple") throw new Error("Export event is not exclusively synthetic")
  const preparation = JSON.parse(await readFile(path.join(directory, "preparation.json"), "utf8"))
  const capture = JSON.parse(await readFile(path.join(directory, "export-capture-checks.json"), "utf8"))
  if (preparation.organizationId !== organizationId || !preparation.secretKeysAndKnownTokensAbsent || !capture.collectionsActuallyOpened || !capture.copyRemainsFrozenAfterActualModification || !capture.csvLiteralValuesVisible || !Array.isArray(capture.files) || capture.files.length !== 3) throw new Error("Actual export privacy/capture evidence missing")
  const allowedFiles = new Set(["members-capture.csv", "activity-capture.csv", "event-archive-capture.json"])
  for (const file of capture.files as { file: string; sha256: string }[]) {
    if (!allowedFiles.delete(file.file)) throw new Error("Unexpected or repeated captured file")
    const bytes = await readFile(path.join(directory, file.file))
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("Captured file changed after checks")
    const emails = bytes.toString("utf8").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
    if (emails.some(email => !/^video\.exports\.(?:member\.[0-3]|owner|leader)@example\.org$/.test(email))) throw new Error("Captured export contains a non-classroom address")
  }
  const archive = JSON.parse(await readFile(path.join(directory, "event-archive-capture.json"), "utf8"))
  if (archive.event.id !== events[0].id || archive.organization.slug !== organization.slug) throw new Error("Captured archive has another scope")
  const secretKeys = new Set(["editToken", "editTokenHash", "editTokenEnc", "editTokenLegacy", "token", "tokenHash", "tokenEnc", "tokenLegacy", "passwordHash"])
  const scan = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(scan); return }
    if (value && typeof value === "object") for (const [key, nested] of Object.entries(value)) {
      if (secretKeys.has(key)) throw new Error("Captured archive contains an access secret")
      scan(nested)
    }
  }
  scan(archive)
}
