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

test("zoom percentages preserve the actual value", () => {
  assert.deepEqual(narrationWords("200 %, 400 %, 100 %"), narrationWords("deux cents pour cent, quatre cents pour cent, cent pour cent"))
  assert.notDeepEqual(narrationWords("200 %"), narrationWords("quatre cents pour cent"))
  assert.notDeepEqual(narrationWords("300 %"), narrationWords("quatre cents pour cent"))
})
