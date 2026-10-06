// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { narrationWords, mismatchedNarrationEdges, unexpectedPauseInstructions } from "../lib/narration-fidelity"

assert.deepEqual(narrationWords("UTF-8, +41, =, +, -, @, =1+1"), narrationWords("UTF huit, plus quarante et un, égal, plus, moins, arobase, égal un plus un"))
assert.notDeepEqual(narrationWords("+42"), narrationWords("plus quarante et un"))
assert.notDeepEqual(narrationWords("=2+1"), narrationWords("égal un plus un"))
assert.notDeepEqual(narrationWords("-"), narrationWords("plus"))
assert.notDeepEqual(narrationWords("UTF-16"), narrationWords("UTF huit"))
assert.notDeepEqual(narrationWords("une valeur est exécutée"), narrationWords("une valeur n'est pas exécutée"))
assert.ok(mismatchedNarrationEdges("Voici notre première phrase et notre dernière conclusion", "Une autre idée arrive au début puis encore une consigne différente").length)
assert.deepEqual(unexpectedPauseInstructions("Voici un conseil", "Voici un conseil courte pause"), ["courte pause"])
console.log("✓ Equivalent notations normalized; wrong numbers, opposite operators, negation, displaced edges and spoken directions remain distinct")
