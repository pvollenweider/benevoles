import { test } from "vitest"
import assert from "node:assert/strict"
import { captionDisplayText, readableCaptions } from "../captions"
test("display dates and hours in French without touching ordinary prose", () => {
  assert.equal(captionDisplayText("le vingt-huit novembre deux mille vingt-six, à onze heures trente"), "le 28/11/2026, à 11 h 30")
  assert.equal(captionDisplayText("de dix heures à vingt-deux heures"), "de 10 h à 22 h")
  assert.equal(captionDisplayText("deux personnes, trente jours, un email"), "deux personnes, trente jours, un email")
})
test("normalized captions remain two lines and retain scene bounds", () => {
  const cues = readableCaptions("Le quatorze novembre deux mille vingt-six, de onze heures à douze heures trente, retrouvons le programme de notre association.", 1000, 12000)
  assert.equal(cues[0].startMs, 1000); assert.equal(cues.at(-1)!.endMs, 13000)
  assert(cues.every(c => c.text.split("\n").length <= 2 && c.text.split("\n").every(line => line.length <= 42)))
})
test("display normalization cannot move any spoken cue boundary", () => {
  for (const text of [
    "Avant le programme, le vingt-huit novembre deux mille vingt-six, à onze heures trente, nous préparons la relève. Après cette date, vérifions les places et le lieu.",
    "Commençons à dix heures. La consigne est importante : le quatorze novembre deux mille vingt-six, de onze heures à douze heures trente. Puis revenons à la liste.",
  ]) {
    const source = readableCaptions(text, 1200, 24000, false)
    const display = readableCaptions(text, 1200, 24000, true)
    assert.deepEqual(display.map(c => [c.startMs, c.endMs]), source.map(c => [c.startMs, c.endMs]))
    assert(display.every(c => c.text.split("\n").length <= 2 && c.text.split("\n").every(line => line.length <= 42)))
  }
})
