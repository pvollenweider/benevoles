// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { assertQuestionsOwnership, questionsSchemaSha256 } from "./prepare-event-questions"
import { test } from "vitest"

test("prepare-event-questions guards", async () => {
  const date = "2026-10-06T10:00:00.000Z"
  const ledger = { schemaVersion: 1, organizationId: "video-questions", eventId: "video-questions-event", memberId: "video-questions-aline", organizationCreatedAt: date, fixtureSchemaSha256: questionsSchemaSha256 }
  assertQuestionsOwnership(ledger, date)
  for (const patch of [{ schemaVersion: 2 }, { organizationId: "default" }, { eventId: "other" }, { memberId: "other" }, { organizationCreatedAt: "2026-10-05T10:00:00.000Z" }, { fixtureSchemaSha256: "unproven" }]) assert.throws(() => assertQuestionsOwnership({ ...ledger, ...patch }, date))
  assert.throws(() => assertQuestionsOwnership(null, date))
})
