// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import type { PrismaClient } from "../../src/generated/prisma/client"

/** The operator's global screens require proof for its entire separate database. */
export async function verifyOperatorReviewFixture(db: PrismaClient, directory: string) {
  const url = new URL(process.env.DATABASE_URL ?? "")
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "45433" && url.pathname === "/benevoles_video_operator")
  const marker = await db.$queryRaw<{ purpose: string }[]>`SELECT purpose FROM public._video_operator_fixture`
  assert.deepEqual(marker, [{ purpose: "benevol-masterclass-53-synthetic-only" }])
  const orgs = await db.organization.findMany({ select: { id: true, name: true, slug: true, replyToEmail: true } })
  assert.equal(orgs.length, 3)
  for (const org of orgs) {
    const side = org.id.slice(-1)
    assert(/^video-operator-org-[abc]$/.test(org.id))
    assert.equal(org.slug, `formation-operateur-${side}`)
    assert.equal(org.name, `Formation Opérateur ${{ a: "Parc", b: "Quartier", c: "Réserve" }[side]}`)
    assert.equal(org.replyToEmail, `video.operator.${side}.owner@example.org`)
  }
  const admins = await db.adminUser.findMany({ select: { id: true, name: true, email: true, organizationId: true, role: true } })
  assert.equal(admins.length, 4)
  for (const admin of admins) {
    assert(["Morgane Exemple", "Élodie Exemple", "Samira Exemple", "Paul Exemple"].includes(admin.name))
    if (admin.id === "video-operator-platform") assert(admin.email === "video.operator.platform@example.org" && admin.organizationId === null && admin.role === "super_admin")
    else assert(/^video-operator-org-[abc]-owner$/.test(admin.id) && admin.email === `video.operator.${admin.id.split("-")[3]}.owner@example.org` && orgs.some(org => org.id === admin.organizationId))
  }
  const members = await db.volunteer.findMany({ select: { id: true, organizationId: true, firstName: true, lastName: true, email: true, notes: true, phone: true } })
  assert.equal(members.length, 9)
  for (const member of members) {
    const match = /^video-operator-org-([ab])-member-([0-5])$/.exec(member.id)
    assert(match)
    assert(member.organizationId === `video-operator-org-${match[1]}` && member.email === `video.operator.${match[1]}.member.${match[2]}@example.org` && member.lastName === "Exemple" && member.firstName === ["Léa", "Emma", "Nicolas", "Zoé", "Sarah", "Lucas"][Number(match[2])] && !member.phone && member.notes === "Donnée fictive pour la formation interne uniquement.")
  }
  const events = await db.event.findMany({ select: { id: true, organizationId: true, title: true, description: true } })
  assert.equal(events.length, 3)
  assert(events.every(event => /^video-operator-org-[ab]-event-[01]$/.test(event.id) && orgs.some(org => org.id === event.organizationId) && /^(Parc|Quartier) — (Fête|Préparation) de formation$/.test(event.title) && event.description === "Données fictives de la formation opérateur."))
  assert.equal(await db.jobRun.count(), 0)
  assert.equal(await db.registration.count(), 0)
  const capture = JSON.parse(await readFile(path.join(directory, "capture-checks.json"), "utf8"))
  for (const key of ["createdPendingOrganization", "oldInviteRefused", "actualActivationAndLogin", "sessionRejectedWhileInactive", "sessionRestoredAfterReactivation", "explicitContextSelection", "realHealthWithoutInventedJobs", "actualUnsubscribe", "exactDisposableDeletion", "ordinaryOwnerPlatformAccessRefused"]) assert.equal(capture[key], true, key)
  assert.equal(capture.publicAliasRedirect?.targetHost, "formation-operateur-jetable-renommee.video.invalid")
  const sends = await db.productUpdateSend.findMany({ select: { subject: true, content: true, sentByAdminId: true, successCount: true, recipientCount: true } })
  assert.equal(sends.length, 1)
  assert(sends[0].subject === "Formation — préparer votre prochain événement" && sends[0].content.includes("# Bienvenue !") && sends[0].sentByAdminId === "video-operator-platform" && sends[0].successCount === 2 && sends[0].recipientCount === 2)
  const response = await fetch("http://localhost:48026/api/v1/messages?limit=1000")
  assert(response.ok)
  const inbox = await response.json() as { total: number; messages: { ID: string; To: { Address: string }[] }[] }
  assert(inbox.total <= 1000 && inbox.messages.every(mail => mail.To.every(to => /@example\.(org|com|net)$/.test(to.Address) || to.Address === "org-admin@localhost")), "Every visible inbox recipient must be synthetic")
  assert.equal(capture.actualInviteMails?.length, 2)
  assert.equal(capture.actualBroadcastEmails?.length, 2)
  for (const id of [...capture.actualInviteMails, capture.actualTestEmail, ...capture.actualBroadcastEmails]) assert(inbox.messages.some(mail => mail.ID === id && mail.To.every(to => /^video\.operator\.(platform|a\.owner|disposable\.owner)@example\.org$/.test(to.Address))), "Actual captured mail is missing or outside this fixture")
}
