// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import type { PrismaClient } from "../../src/generated/prisma/client"

/** Refuse external visual review unless both captured classrooms are exclusively synthetic. */
export async function verifyPrivacyReviewFixture(db: PrismaClient, directory: string) {
  const url = new URL(process.env.DATABASE_URL ?? "")
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/benevoles_video") throw new Error("Isolated local video database required")
  const names = ["Léa", "Emma", "Nicolas", "Zoé", "Sarah"]
  for (const side of ["a", "b"]) {
    const id = `video-privacy-${side}`
    const org = await db.organization.findUniqueOrThrow({ where: { id } })
    if (org.name !== `Formation — confidentialité ${side.toUpperCase()}` || org.slug !== `formation-confidentialite-${side}` || org.replyToEmail !== `video.privacy.${side}.owner@example.org`) throw new Error("Unexpected privacy classroom")
    const admins = await db.adminUser.findMany({ where: { organizationId: id } })
    if (admins.length !== 1 || admins[0].id !== `${id}-owner` || admins[0].email !== org.replyToEmail || admins[0].name !== (side === "a" ? "Élodie Exemple" : "Colette Exemple")) throw new Error("Non-classroom administrator")
    const people = await db.volunteer.findMany({ where: { organizationId: id } })
    if (people.length !== (side === "a" ? 6 : 5)) throw new Error("Unexpected privacy member count")
    for (const person of people) {
      const index = names.findIndex((name, i) => name === person.firstName && person.id === `${id}-member-${i}`)
      const seeded = index >= 0 && person.email === `video.privacy.${side}.member.${index}@example.org`
      const signup = side === "a" && person.firstName === "Jules" && person.email === "video.privacy.a.new@example.org"
      if ((!seeded && !signup) || person.lastName !== "Exemple" || !/^\+41\s?79\s?000\s?\d{4}$/.test(person.phone ?? "")) throw new Error("Non-synthetic privacy member")
      if (seeded && person.notes !== (index === 0 ? `Note interne fictive — organisation ${side.toUpperCase()}` : "Exemple de formation uniquement.")) throw new Error("Unexpected member note")
    }
    const events = await db.event.findMany({ where: { organizationId: id }, include: { registrations: true, sectorLeaders: true, shifts: true } })
    if (events.length !== 1 || events[0].id !== `${id}-event` || events[0].title !== `Fête des liens — organisation ${side.toUpperCase()}` || events[0].slug !== "fete-des-liens" || events[0].shifts.length !== 2 || events[0].sectorLeaders.length || events[0].registrations.length !== (side === "a" ? 5 : 4) || events[0].registrations.some(reg => !people.some(person => person.id === reg.volunteerId))) throw new Error("Unexpected privacy event scope")
  }
  const preflight = JSON.parse(await readFile(path.join(directory, "preparation.json"), "utf8"))
  const capture = JSON.parse(await readFile(path.join(directory, "capture-checks.json"), "utf8"))
  if (!preflight.crossOrganizationDetailRefusedBothWays || !preflight.leaderRevocationRefusesOldLink || preflight.actualEmailsReceived?.length !== 3) throw new Error("Actual privacy preflight missing")
  for (const key of ["anonymousSignupLinkOnlyInEmail", "sameRecoveryMessageThreeAddresses", "invitationPrefill", "actualLeaderRevocation", "actualAdminAnswerAndInternalNote", "actualPublicLegalPages", "actualReportVsMemberCsv"]) if (capture[key] !== true) throw new Error(`Actual capture proof missing: ${key}`)
  const csv = await readFile(path.join(directory, "privacy-members.csv"))
  const leaderFrame = await readFile(path.join(directory, "leader-before-revocation.png"))
  if (createHash("sha256").update(leaderFrame).digest("hex") !== capture.leaderFrameSha256) throw new Error("Recorded leader recap image changed")
  if (createHash("sha256").update(csv).digest("hex") !== capture.memberCsvSha256) throw new Error("Captured member CSV changed")
  const emails = csv.toString("utf8").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
  if (emails.length !== 6 || emails.some(email => !/^video\.privacy\.a\.(?:member\.[0-4]|new)@example\.org$/.test(email))) throw new Error("Captured member CSV is not exclusively synthetic")
  // The Mailpit inbox is visible during capture: its other recipients must also be fictitious.
  const response = await fetch("http://localhost:48026/api/v1/messages?limit=1000")
  if (!response.ok) throw new Error("Local demonstration inbox unavailable")
  const inbox = await response.json() as { total: number; messages: { ID: string; To: { Address: string }[] }[] }
  const syntheticRecipient = (address: string) => /@example\.(?:org|com|net)$/.test(address) || address === "org-admin@localhost"
  if (inbox.total > 1000 || inbox.messages.some(mail => mail.To.some(to => !syntheticRecipient(to.Address)))) throw new Error("Visible inbox has non-synthetic recipients or is not fully checked")
  for (const [key, recipient] of [["signupMail", "video.privacy.a.new@example.org"], ["resendMail", "video.privacy.a.new@example.org"], ["recoveryMail", "video.privacy.a.member.0@example.org"], ["invitationMail", "video.privacy.a.member.3@example.org"]]) if (!inbox.messages.some(mail => mail.ID === capture[key] && mail.To.some(to => to.Address === recipient))) throw new Error("Actual captured email missing")
}
