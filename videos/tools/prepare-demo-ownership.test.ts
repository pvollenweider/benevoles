// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { ownsRecordedNoEmailMember } from "./prepare-demo"

test("only the exact recent 201-created fictional contact is owned", () => {
  const now = Date.parse("2026-10-06T12:00:00Z")
  const member = { id: "cmemberfixture0001", organizationId: "default", firstName: "René", lastName: "Aubert", phone: "079 000 90 02", email: null }
  const proof = { ...member, responseStatus: 201, createdAt: "2026-10-06T11:59:00Z" }
  assert(ownsRecordedNoEmailMember(member, [proof], now))
  assert(ownsRecordedNoEmailMember({ ...member, phone: "0790009002" }, [proof], now))
  assert(!ownsRecordedNoEmailMember(member, [], now))
  for (const change of [{ id: "cmemberfixture0002" }, { organizationId: "another-org" }, { firstName: "Rene" }, { lastName: "Aubert autre" }, { phone: "079 000 90 03" }, { email: "real@example.com" }]) assert(!ownsRecordedNoEmailMember({ ...member, ...change }, [proof], now))
  for (const change of [{ responseStatus: 200 }, { organizationId: "another-org" }, { phone: "079 000 90 03" }, { email: "someone@example.org" }, { createdAt: "2026-08-01T00:00:00Z" }, { createdAt: "2026-10-07T00:00:00Z" }, { createdAt: "invalid" }]) assert(!ownsRecordedNoEmailMember(member, [{ ...proof, ...change }], now))
})
