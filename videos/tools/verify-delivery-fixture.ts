// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import { writeFile } from "node:fs/promises"
import { verifyDeliveryReviewFixture } from "../lib/verify-delivery-review-fixture"
async function main() {
  const { prisma: db } = await import("../../src/lib/prisma")
  try {
    await verifyDeliveryReviewFixture(db, "videos/output/email-delivery-failures")
    await writeFile("videos/output/email-delivery-failures/fixture-review.json", JSON.stringify({ checkedAt: new Date().toISOString(), syntheticScopeVerified: true, scope: "Current fixture and real capture outcomes; not audiovisual validation" }, null, 2))
    console.log("✓ Exact synthetic delivery organization, people, accounts, event, messages and received emails verified")
  } finally { await db.$disconnect() }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Delivery scope check failed"); process.exitCode = 1 })
