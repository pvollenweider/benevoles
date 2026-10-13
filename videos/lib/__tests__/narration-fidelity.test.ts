// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "vitest"
import { narrationWords, unexpectedPauseInstructions } from "../narration-fidelity"

test("demo domain homophones and spelled hyphen retain their spoken meaning", () => {
  assert.deepEqual(narrationWords("fetes-de-montvert point benevol point app"), narrationWords("fête tiret de Mont vert point bénévole point app"))
  assert.notDeepEqual(narrationWords("autre-espace point benevol point app"), narrationWords("fête tiret de Mont vert point bénévole point app"))
  assert.notDeepEqual(narrationWords("Vous choisissez."), narrationWords("Tu choisis."))
  assert.deepEqual(unexpectedPauseInstructions("Vous choisissez.", "Vous choisissez. Short pause."), ["short pause"])
})
