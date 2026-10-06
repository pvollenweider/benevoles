// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { assertHoursOwnership, hoursSchemaHash } from "./prepare-volunteer-hours"
import { test } from "vitest"

test("prepare-volunteer-hours guards", async () => {
  const created = "2026-10-06T12:00:00.000Z"
  const good = { schemaVersion: 1, organizationId: "video-hours", organizationCreatedAt: created, fixtureSchemaSha256: hoursSchemaHash }
  assertHoursOwnership(good, created)
  for (const value of [null, {}, { ...good, organizationId: "default" }, { ...good, organizationCreatedAt: "2026-10-05T12:00:00.000Z" }, { ...good, fixtureSchemaSha256: "wrong" }, { ...good, schemaVersion: 2 }]) assert.throws(() => assertHoursOwnership(value, created))
})
