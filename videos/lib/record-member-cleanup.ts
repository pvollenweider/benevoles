// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { loadCurrentVideoPrisma } from "./current-product-prisma"

/** Check the actual result of the on-screen bulk action, never seed its outcome. */
export async function verifyRecordedMemberCleanup(directory: string) {
  const current = await loadCurrentVideoPrisma("http://localhost:43102")
  try {
    const member = await current.db.volunteer.findUniqueOrThrow({ where: { id: "video-member-management-2" } })
    assert(member.organizationId === "default" && member.firstName === "René" && member.lastName === "Meyer" && member.active === false, "The registered synthetic member must remain, deactivated")
    const registration = await current.db.registration.findUniqueOrThrow({ where: { id: "video-import-kept-registration" } })
    assert(registration.volunteerId === member.id && registration.status === "active", "Bulk cleanup must preserve the exact existing registration")
    const extras = await current.db.volunteer.count({ where: { organizationId: "default", firstName: "René", OR: [{ lastName: "Aubert", email: null, phone: "079 000 90 02" }, { lastName: "Meyer", email: null, phone: "+41 79 000 10 03" }] } })
    assert.equal(extras, 0, "The two selected extra contacts must really be deleted")
    const proof = { checkedAt: new Date().toISOString(), product: current.product, retainedMemberId: member.id, memberDeactivated: true, retainedRegistrationId: registration.id, registrationStatus: registration.status, extraRowsRemaining: extras }
    await writeFile(path.join(directory, "bulk-cleanup-checks.json"), JSON.stringify(proof, null, 2) + "\n")
    return proof
  } finally { await current.db.$disconnect(); await current.unregister() }
}
