import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * A merge moves registrations and therefore the organisation-wide link (#1429): the surviving
 * record's token is revoked (the absorbed address may have received it), and the tombstone keeps
 * none. The revocation is a single updateMany by id inside the transaction, so a token issued
 * between the loads and the write is cleared too. The full transaction runs on Postgres in
 * src/__integration__; this guard keeps the write from disappearing silently from the module.
 */
describe("member merge — organisation-wide link (#1429)", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "member-merge-transaction.ts"), "utf-8")

  it("clears the surviving record's link by id inside the transaction, not from a hash read before it", () => {
    expect(source).toContain("await tx.volunteer.updateMany({ where: { id: keepId, orgLinkTokenHash: { not: null } }, data: clearOrgLinkData() })")
    expect(source).not.toContain("keepOrgLink?.orgLinkTokenHash")
    expect(source).not.toContain("absorbOrgLink?.orgLinkTokenHash")
  })

  it("clears the absorbed record's link with the rest of its personal fields", () => {
    expect(source).toMatch(/orgLinkTokenHash: null, orgLinkTokenEnc: null, orgLinkTokenLegacy: null, orgLinkIssuedAt: null/)
  })
})
