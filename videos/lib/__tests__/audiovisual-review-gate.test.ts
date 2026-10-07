// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { audiovisualNeedsReview } from "../../tools/audit-audiovisual"

const clean = () => ({
  heardOpening: "Bonjour", issues: [] as string[],
  voice: { consistent: true, warm: true, observation: "Voix souriante constante" },
  checkpoints: [{ spokenSeconds: 1, spoken: "Ouvrons", visibleSeconds: 1, visible: "Ouverture réelle", sync: "aligned" as const, severity: "none" as const }],
})
test("a clean synchronized warm voice may pass", () => assert.equal(audiovisualNeedsReview(clean()), false))
test("a voice-only mismatch cannot pass without a textual issue", () => {
  const inconsistent = clean(); inconsistent.voice.consistent = false
  assert.equal(audiovisualNeedsReview(inconsistent), true)
  const cold = clean(); cold.voice.warm = false
  assert.equal(audiovisualNeedsReview(cold), true)
})
test("a missing or uncertain action cannot pass as a minor checkpoint", () => {
  for (const sync of ["missing", "uncertain"] as const) {
    assert.equal(audiovisualNeedsReview({ ...clean(), checkpoints: [{ ...clean().checkpoints[0], sync }] }), true)
  }
})
